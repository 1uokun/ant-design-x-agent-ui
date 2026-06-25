import {
  ABORT_POLL_MS,
  CHAT_TIMEOUT_MS,
  EventType,
  abortKey,
} from "../constants";
import { buildChatHistory, getMessageByMessageId, persistV1ChatResponse } from "../db";
import type { Env } from "../env";
import type { ChatRequestBody } from "../types";
import {
  appendDelta,
  cleanup,
  pickLongerText,
  readAll,
  tryAcquireFinalizeLock,
} from "./streamBuffer";

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

/**
 * 在 Queue / waitUntil 中执行的上游流式读取，与客户端 SSE 连接完全解耦。
 * 仅当用户主动 abort（KV 标记）或超时才会中断。
 */
export async function runChatStreamTask(env: Env, body: ChatRequestBody): Promise<void> {
  const modelName = body.modelName || env.DEFAULT_MODEL || "deepseek-chat";
  const history = await buildChatHistory(env.DB, body.sessionId, body.requestId);
  const requestMessages = body.requestMessages ?? [];
  const currentUserText = requestMessages.map((m) => m.text).join("\n");
  const messages = [...history, { role: "user" as const, content: currentUserText }];

  const baseUrl = (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    await finalizeV1ChatResponse(env, body, EventType.ERROR, "");
    return;
  }

  const upstreamAbort = new AbortController();
  let localBuffer = "";
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

  const sendError = async (message: string) => {
    if (!trySetEventType(EventType.ERROR)) return;
    console.error("[streamRunner] error:", message);
    await finalizeOnce();
  };

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
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
      signal: upstreamAbort.signal,
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
          try {
            upstreamAbort.abort();
          } catch {
            // ignore
          }
          await finalizeOnce();
        }
        return;
      }

      if (Date.now() - lastAbortCheck >= ABORT_POLL_MS) {
        lastAbortCheck = Date.now();
        if (await isAborted(env.STREAM_KV, body.sessionId, body.messageId)) {
          if (trySetEventType(EventType.ABORT)) {
            try {
              upstreamAbort.abort();
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
            await finalizeOnce();
          }
          return;
        }

        const delta = extractDeltaContent(data);
        if (delta) {
          localBuffer += delta;
          await appendDelta(env.STREAM_KV, body.sessionId, body.messageId, delta);
        }
      }
    }

    if (trySetEventType(EventType.COMPLETE)) {
      await finalizeOnce();
    }
  } catch (err) {
    if (upstreamAbort.signal.aborted) return;
    const message = err instanceof Error ? err.message : "stream failed";
    await sendError(message);
  }
}

/** Queue 消费入口：幂等，仅处理仍在 STREAMING 的消息 */
export async function processChatStreamQueueMessage(env: Env, body: ChatRequestBody): Promise<void> {
  const existing = await getMessageByMessageId(env.DB, body.messageId);
  if (!existing || existing.eventType !== EventType.STREAMING) return;
  await runChatStreamTask(env, body);
}
