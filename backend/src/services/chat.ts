import { abortKey } from "../constants";
import { prepareChat } from "../db";
import type { Env } from "../env";
import type { ChatRequestBody } from "../types";
import { cleanup } from "./streamBuffer";
import { createKvPollingSseStream } from "./pollingSse";
import { runChatStreamTask } from "./streamRunner";

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
  try {
    await prepareChat(env.DB, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "prepareChat failed";
    const status = (err as Error & { status?: number }).status ?? 400;
    return new Response(JSON.stringify({ success: false, message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ success: false, message: "OPENAI_API_KEY 未配置" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  await cleanup(env.STREAM_KV, body.sessionId, body.messageId);
  await env.STREAM_KV.delete(abortKey(body.sessionId, body.messageId));

  // 上游读取放入 Queue，与客户端 SSE 生命周期解耦（刷新页面不会中断）
  if (env.CHAT_QUEUE) {
    await env.CHAT_QUEUE.send(body);
  } else {
    ctx.waitUntil(runChatStreamTask(env, body));
  }

  const readable = createKvPollingSseStream(env, body.sessionId, body.messageId);

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
