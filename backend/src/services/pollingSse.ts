import { EventType } from "../constants";
import { getMessageByMessageId } from "../db";
import type { Env } from "../env";
import { readAll } from "./streamBuffer";

const SSE_POLL_MS = 100;

function sseEvent(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`;
}

function formatOpenAiDelta(delta: string): string {
  return JSON.stringify({ choices: [{ delta: { content: delta } }] });
}

/**
 * 从 KV 缓冲轮询并输出 SSE，客户端断连后仅停止推送，不影响 Queue 中的上游读取。
 */
export function createKvPollingSseStream(
  env: Env,
  sessionId: string,
  messageId: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let lastSentLen = 0;
  let cancelled = false;

  return new ReadableStream({
    async start(controller) {
      try {
        while (!cancelled) {
          const text = await readAll(env.STREAM_KV, sessionId, messageId);
          if (text.length > lastSentLen) {
            const delta = text.slice(lastSentLen);
            lastSentLen = text.length;
            controller.enqueue(
              encoder.encode(sseEvent("message", formatOpenAiDelta(delta))),
            );
          }

          const row = await getMessageByMessageId(env.DB, messageId);
          if (!row || row.eventType !== EventType.STREAMING) {
            controller.enqueue(encoder.encode(sseEvent("message", "[DONE]")));
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, SSE_POLL_MS));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "sse poll failed";
        controller.enqueue(encoder.encode(sseEvent("error", message)));
      } finally {
        try {
          controller.close();
        } catch {
          // ignore
        }
      }
    },
    cancel() {
      cancelled = true;
    },
  });
}
