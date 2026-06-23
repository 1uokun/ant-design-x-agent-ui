import {
  ABORT_POLL_MS,
  CHAT_TIMEOUT_MS,
  EventType,
  FINALIZE_LOCK_TTL_SECONDS,
  SourceType,
  STREAM_TTL_SECONDS,
  abortKey,
  finalizeLockKey,
  streamKey,
} from "../constants";
import {
  buildChatHistory,
  getMessageByMessageId,
  prepareChat,
  updateMessageFinalize,
  upsertAgentContent,
} from "../db";
import type { Env } from "../env";
import type { ChatRequestBody, ContentItem } from "../types";
import { nowIso } from "../utils";

type StreamState = {
  chunks: string[];
};

async function getStreamState(kv: KVNamespace, key: string): Promise<StreamState> {
  const raw = await kv.get(key, "json");
  if (raw && typeof raw === "object" && Array.isArray((raw as StreamState).chunks)) {
    return raw as StreamState;
  }
  return { chunks: [] };
}

async function appendStreamChunk(kv: KVNamespace, key: string, chunk: string): Promise<void> {
  const state = await getStreamState(kv, key);
  state.chunks.push(chunk);
  await kv.put(key, JSON.stringify(state), { expirationTtl: STREAM_TTL_SECONDS });
}

async function readStreamText(kv: KVNamespace, key: string, localBuffer: string): Promise<string> {
  const state = await getStreamState(kv, key);
  const remote = state.chunks.join("");
  return remote.length >= localBuffer.length ? remote : localBuffer;
}

async function clearStreamKeys(
  kv: KVNamespace,
  sessionId: string,
  messageId: string,
): Promise<void> {
  await Promise.all([
    kv.delete(streamKey(sessionId, messageId)),
    kv.delete(abortKey(sessionId, messageId)),
    kv.delete(finalizeLockKey(sessionId, messageId)),
  ]);
}

async function isAborted(kv: KVNamespace, sessionId: string, messageId: string): Promise<boolean> {
  const flag = await kv.get(abortKey(sessionId, messageId));
  return flag === "1";
}

async function acquireFinalizeLock(
  kv: KVNamespace,
  sessionId: string,
  messageId: string,
): Promise<boolean> {
  const key = finalizeLockKey(sessionId, messageId);
  const existing = await kv.get(key);
  if (existing) return false;
  await kv.put(key, "1", { expirationTtl: FINALIZE_LOCK_TTL_SECONDS });
  return true;
}

async function finalizeChat(
  env: Env,
  params: {
    sessionId: string;
    messageId: string;
    responseId: string;
    eventType: number;
    localBuffer: string;
  },
): Promise<void> {
  const { sessionId, messageId, responseId, eventType, localBuffer } = params;
  const lockAcquired = await acquireFinalizeLock(env.STREAM_KV, sessionId, messageId);
  if (!lockAcquired) return;

  const message = await getMessageByMessageId(env.DB, messageId);
  if (!message || message.eventType !== EventType.STREAMING) return;

  const text = await readStreamText(
    env.STREAM_KV,
    streamKey(sessionId, messageId),
    localBuffer,
  );

  if (text.trim()) {
    const items: ContentItem[] = [{ type: "text/plain", text }];
    await upsertAgentContent(env.DB, SourceType.ASSISTANT, responseId, items);
  }

  await updateMessageFinalize(env.DB, messageId, eventType, nowIso());
  await clearStreamKeys(env.STREAM_KV, sessionId, messageId);
}

function sseEvent(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`;
}

async function* readOpenAiSse(
  response: Response,
): AsyncGenerator<{ content?: string; done?: boolean; error?: string }> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") {
        yield { done: true };
        continue;
      }

      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
          error?: { message?: string };
        };
        if (json.error?.message) {
          yield { error: json.error.message };
          continue;
        }
        const content = json.choices?.[0]?.delta?.content;
        if (content) yield { content };
      } catch {
        // ignore malformed chunk
      }
    }
  }
}

export async function handleChatAbort(env: Env, sessionId: string, messageId: string): Promise<void> {
  await env.STREAM_KV.put(abortKey(sessionId, messageId), "1", {
    expirationTtl: STREAM_TTL_SECONDS,
  });
}

export async function handleChatStream(
  env: Env,
  body: ChatRequestBody,
  ctx: { waitUntil: (promise: Promise<unknown>) => void },
): Promise<Response> {
  let requestMessages: ContentItem[];
  try {
    const prepared = await prepareChat(env.DB, body);
    requestMessages = prepared.requestMessages;
  } catch (err) {
    const message = err instanceof Error ? err.message : "prepareChat failed";
    const status = (err as Error & { status?: number }).status ?? 400;
    return new Response(JSON.stringify({ success: false, message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const modelName = body.modelName || env.DEFAULT_MODEL || "deepseek-chat";
  const history = await buildChatHistory(env.DB, body.sessionId, body.requestId);
  const currentUserText = requestMessages.map((m) => m.text).join("\n");

  const messages = [
    ...history,
    { role: "user" as const, content: currentUserText },
  ];

  const baseUrl = (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ success: false, message: "OPENAI_API_KEY 未配置" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sk = streamKey(body.sessionId, body.messageId);
  await env.STREAM_KV.delete(sk);
  await env.STREAM_KV.delete(abortKey(body.sessionId, body.messageId));

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const streamTask = async () => {
    let localBuffer = "";
    let upstream: Response | null = null;
    const startedAt = Date.now();

    const safeWrite = async (chunk: string) => {
      try {
        await writer.write(encoder.encode(chunk));
      } catch {
        // 客户端断连后继续上游读取，不中断 finalize
      }
    };

    try {
      upstream = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          stream: true,
          messages,
        }),
      });

      if (!upstream.ok) {
        const errText = await upstream.text();
        await safeWrite(sseEvent("error", errText || `upstream ${upstream.status}`));
        await finalizeChat(env, {
          sessionId: body.sessionId,
          messageId: body.messageId,
          responseId: body.responseId,
          eventType: EventType.ERROR,
          localBuffer,
        });
        return;
      }

      let lastAbortCheck = 0;

      for await (const part of readOpenAiSse(upstream)) {
        if (Date.now() - startedAt > CHAT_TIMEOUT_MS) {
          await finalizeChat(env, {
            sessionId: body.sessionId,
            messageId: body.messageId,
            responseId: body.responseId,
            eventType: EventType.ABORT,
            localBuffer,
          });
          return;
        }

        if (Date.now() - lastAbortCheck >= ABORT_POLL_MS) {
          lastAbortCheck = Date.now();
          if (await isAborted(env.STREAM_KV, body.sessionId, body.messageId)) {
            try {
              await upstream.body?.cancel();
            } catch {
              // ignore
            }
            await finalizeChat(env, {
              sessionId: body.sessionId,
              messageId: body.messageId,
              responseId: body.responseId,
              eventType: EventType.ABORT,
              localBuffer,
            });
            return;
          }
        }

        if (part.error) {
          await safeWrite(sseEvent("error", part.error));
          await finalizeChat(env, {
            sessionId: body.sessionId,
            messageId: body.messageId,
            responseId: body.responseId,
            eventType: EventType.ERROR,
            localBuffer,
          });
          return;
        }

        if (part.done) {
          await safeWrite(sseEvent("message", "[DONE]"));
          await finalizeChat(env, {
            sessionId: body.sessionId,
            messageId: body.messageId,
            responseId: body.responseId,
            eventType: EventType.COMPLETE,
            localBuffer,
          });
          return;
        }

        if (part.content) {
          localBuffer += part.content;
          await appendStreamChunk(env.STREAM_KV, sk, part.content);
          const payload = JSON.stringify({
            choices: [{ delta: { content: part.content } }],
          });
          await safeWrite(sseEvent("message", payload));
        }
      }

      // 上游意外结束，按 complete 处理
      await safeWrite(sseEvent("message", "[DONE]"));
      await finalizeChat(env, {
        sessionId: body.sessionId,
        messageId: body.messageId,
        responseId: body.responseId,
        eventType: EventType.COMPLETE,
        localBuffer,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "stream failed";
      await safeWrite(sseEvent("error", message));
      await finalizeChat(env, {
        sessionId: body.sessionId,
        messageId: body.messageId,
        responseId: body.responseId,
        eventType: EventType.ERROR,
        localBuffer,
      });
    } finally {
      try {
        await writer.close();
      } catch {
        // ignore
      }
    }
  };

  ctx.waitUntil(streamTask());

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
