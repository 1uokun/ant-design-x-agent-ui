import { Hono } from "hono";
import { cors } from "hono/cors";
import { feedbackFromApi } from "./content";
import {
  deleteMessage,
  deleteSession,
  listMessageTurns,
  listSessions,
  updateFeedback,
  updateSession,
} from "./db";
import { EventType } from "./constants";
import { handleChatAbort, handleChatStream } from "./services/chat";
import { listUpstreamModelIds } from "./services/models";
import { getStreamBuffer } from "./services/getStreamBuffer";
import { handleStreamBufferSubscribe } from "./services/subscribeStreamBuffer";
import { processChatStreamQueueMessage } from "./services/streamRunner";
import { readAll } from "./services/streamBuffer";
import type {
  AbortBody,
  ChatRequestBody,
  FeedbackBody,
  MessageDeleteBody,
  SessionDeleteBody,
  SessionUpdateBody,
} from "./types";
import { jsonError, jsonOk } from "./utils";
import type { Env } from "./env";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Accept"],
  }),
);

app.get("/api/v1/session/page/list", async (c) => {
  const userId = Number(c.req.query("userId") ?? "0");
  const list = await listSessions(c.env.DB, userId);
  return jsonOk({ list });
});

app.post("/api/v1/session/update", async (c) => {
  const body = await c.req.json<SessionUpdateBody>();
  if (!body.sessionId) return jsonError("sessionId 不能为空");

  const ok = await updateSession(c.env.DB, body.sessionId, {
    title: body.title,
    pinned: body.pinned,
  });
  if (!ok) return jsonError("会话不存在", 404);
  return jsonOk(true);
});

app.post("/api/v1/session/delete", async (c) => {
  const body = await c.req.json<SessionDeleteBody>();
  if (!body.sessionId) return jsonError("sessionId 不能为空");

  const ok = await deleteSession(c.env.DB, body.sessionId);
  if (!ok) return jsonError("会话不存在", 404);
  return jsonOk(true);
});

app.get("/api/v1/session/msg/list", async (c) => {
  const sessionId = c.req.query("sessionId");
  if (!sessionId) return jsonError("sessionId 不能为空");

  const pageRaw = c.req.query("page");
  const pageSizeRaw = c.req.query("pageSize");
  const orderRaw = c.req.query("order");

  const pageSize =
    pageSizeRaw !== undefined && pageSizeRaw !== ""
      ? Number(pageSizeRaw)
      : undefined;
  if (pageSize !== undefined && (!Number.isFinite(pageSize) || pageSize <= 0)) {
    return jsonError("pageSize 必须为正整数");
  }

  const page =
    pageRaw !== undefined && pageRaw !== "" ? Number(pageRaw) : undefined;
  if (page !== undefined && (!Number.isFinite(page) || page <= 0)) {
    return jsonError("page 必须为正整数");
  }

  if (orderRaw && orderRaw !== "asc" && orderRaw !== "desc") {
    return jsonError("order 必须为 asc 或 desc");
  }

  const { list, page: pageInfo } = await listMessageTurns(c.env.DB, sessionId, {
    page,
    pageSize,
    order: orderRaw === "desc" ? "desc" : "asc",
  });

  for (const turn of list) {
    if (turn.eventType !== EventType.STREAMING) continue;
    const partial = await readAll(c.env.STREAM_KV, sessionId, turn.messageId);
    if (partial) {
      turn.responseMessages = [{ type: "text/plain", text: partial }];
    }
  }
  return jsonOk({ page: pageInfo, list });
});

app.post("/api/v1/session/msg/delete", async (c) => {
  const body = await c.req.json<MessageDeleteBody>();
  if (!body.messageId) return jsonError("messageId 不能为空");

  const ok = await deleteMessage(c.env.DB, body.messageId);
  if (!ok) return jsonError("消息不存在", 404);
  return jsonOk(true);
});

app.post("/api/v1/session/msg/feedback", async (c) => {
  const body = await c.req.json<FeedbackBody>();
  if (!body.sessionId || !body.messageId || !body.feedbackType) {
    return jsonError("sessionId / messageId / feedbackType 不能为空");
  }
  if (body.feedbackType !== "good" && body.feedbackType !== "bad") {
    return jsonError("feedbackType 必须为 good 或 bad");
  }

  const ok = await updateFeedback(
    c.env.DB,
    body.sessionId,
    body.messageId,
    feedbackFromApi(body.feedbackType),
  );
  if (!ok) return jsonError("消息不存在", 404);
  return jsonOk(true);
});

app.post("/api/v1/chat/abort", async (c) => {
  const body = await c.req.json<AbortBody>();
  if (!body.sessionId || !body.messageId) {
    return jsonError("sessionId / messageId 不能为空");
  }

  await handleChatAbort(c.env, body.sessionId, body.messageId);
  return jsonOk(true);
});

app.get("/api/v1/chat/stream-buffer", async (c) => {
  const sessionId = c.req.query("sessionId");
  const messageId = c.req.query("messageId");
  if (!sessionId || !messageId) {
    return jsonError("sessionId / messageId 不能为空");
  }

  const accept = c.req.header("Accept") ?? "";
  if (accept.includes("text/event-stream")) {
    const offset = Number(c.req.query("offset") ?? "0");
    return handleStreamBufferSubscribe(
      c.env,
      sessionId,
      messageId,
      Number.isFinite(offset) ? offset : 0,
    );
  }

  const data = await getStreamBuffer(c.env, sessionId, messageId);
  if (!data) return jsonError("消息不存在", 404);
  return jsonOk(data);
});

app.get("/api/v1/models", async (c) => {
  try {
    const ids = await listUpstreamModelIds(c.env);
    return jsonOk({ list: ids.map((id) => ({ id })) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "list models failed";
    return jsonError(message, 502);
  }
});

app.post("/api/v1/chat", async (c) => {
  const body = await c.req.json<ChatRequestBody>();
  if (!body.sessionId || !body.messageId || !body.requestId || !body.responseId) {
    return jsonError("sessionId / messageId / requestId / responseId 不能为空");
  }
  if (!Array.isArray(body.requestMessages) || body.requestMessages.length === 0) {
    return jsonError("requestMessages 不能为空");
  }

  return handleChatStream(c.env, body, c.executionCtx);
});

app.get("/health", (c) => c.json({ ok: true }));

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<ChatRequestBody>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processChatStreamQueueMessage(env, message.body);
        message.ack();
      } catch (err) {
        console.error("[chat-stream queue] failed:", err);
        message.retry();
      }
    }
  },
};
