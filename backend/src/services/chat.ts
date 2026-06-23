import {
  ABORT_POLL_MS,
  CHAT_TIMEOUT_MS,
  EventType,
  abortKey,
} from "../constants";
import { persistV1ChatResponse, prepareChat, buildChatHistory } from "../db";
import type { Env } from "../env";
import type { ChatRequestBody, ContentItem } from "../types";
import {
  appendDelta,
  cleanup,
  pickLongerText,
  readAll,
  tryAcquireFinalizeLock,
} from "./streamBuffer";

function sseEvent(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`;
}

function extractDeltaContent(sseData: string): string | null {
  try {
    const json = JSON.parse(sseData) as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.delta?.content;
    if (!content) return null;
    return content;
  } catch {
    return null;
  }
}

async function finalizeV1ChatResponse(
  env: Env,
  request: ChatRequestBody,
  eventType: number,
  localFallbackText: string,
): Promise<void> {
  const lockAcquired = await tryAcquireFinalizeLock(
    env.STREAM_KV,
    request.sessionId,
    request.messageId,
  );
  if (!lockAcquired) return;

  try {
    const redisText = await readAll(env.STREAM_KV, request.sessionId, request.messageId);
    const text = pickLongerText(redisText, localFallbackText);
    await persistV1ChatResponse(
      env.DB,
      { messageId: request.messageId, responseId: request.responseId },
      eventType,
      text,
    );
  } finally {
    await cleanup(env.STREAM_KV, request.sessionId, request.messageId);
  }
}

async function isAborted(kv: KVNamespace, sessionId: string, messageId: string): Promise<boolean> {
  return (await kv.get(abortKey(sessionId, messageId))) === "1";
}

export async function handleChatAbort(env: Env, sessionId: string, messageId: string): Promise<void> {
  await env.STREAM_KV.put(abortKey(sessionId, messageId), "1", {
    expirationTtl: 30 * 60,
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

  const messages = [...history, { role: "user" as const, content: currentUserText }];

  const baseUrl = (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ success: false, message: "OPENAI_API_KEY 未配置" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  await cleanup(env.STREAM_KV, body.sessionId, body.messageId);
  await env.STREAM_KV.delete(abortKey(body.sessionId, body.messageId));

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const streamTask = async () => {
    let localBuffer = "";
    let upstream: Response | null = null;
    const startedAt = Date.now();
    let eventType: number | null = null;

    const finalizeOnce = async () => {
      const type = eventType ?? EventType.ABORT;
      await finalizeV1ChatResponse(env, body, type, localBuffer);
    };

    const trySetEventType = (type: number): boolean => {
      if (eventType !== null) return false;
      eventType = type;
      return true;
    };

    const safeWrite = async (chunk: string) => {
      try {
        await writer.write(encoder.encode(chunk));
      } catch {
        // 客户端断连后继续读上游，不在此处 finalize
      }
    };

    const sendError = async (message: string) => {
      if (!trySetEventType(EventType.ERROR)) return;
      await safeWrite(sseEvent("error", message));
      await finalizeOnce();
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
        await sendError(errText || `upstream ${upstream.status}`);
        return;
      }

      const reader = upstream.body?.getReader();
      if (!reader) {
        await sendError("upstream body empty");
        return;
      }

      const decoder = new TextDecoder();
      let lineBuffer = "";
      let lastAbortCheck = 0;

      while (true) {
        if (Date.now() - startedAt > CHAT_TIMEOUT_MS) {
          if (trySetEventType(EventType.ABORT)) {
            await finalizeOnce();
          }
          return;
        }

        if (Date.now() - lastAbortCheck >= ABORT_POLL_MS) {
          lastAbortCheck = Date.now();
          if (await isAborted(env.STREAM_KV, body.sessionId, body.messageId)) {
            if (trySetEventType(EventType.ABORT)) {
              try {
                await reader.cancel();
              } catch {
                // ignore
              }
              await finalizeOnce();
            }
            return;
          }
        }

        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;

          const data = trimmed.slice("data:".length).trim();
          if (data === "[DONE]") {
            if (trySetEventType(EventType.COMPLETE)) {
              await safeWrite(sseEvent("message", "[DONE]"));
              await finalizeOnce();
            }
            return;
          }

          const delta = extractDeltaContent(data);
          if (delta) {
            localBuffer += delta;
            await appendDelta(env.STREAM_KV, body.sessionId, body.messageId, delta);
          }

          await safeWrite(sseEvent("message", data));
        }
      }

      if (trySetEventType(EventType.COMPLETE)) {
        await safeWrite(sseEvent("message", "[DONE]"));
        await finalizeOnce();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "stream failed";
      await sendError(message);
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
