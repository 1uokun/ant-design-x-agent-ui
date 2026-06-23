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
import { handleChatAbort, handleChatStream } from "./services/chat";
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
  return jsonOk({ page: {}, list });
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

  const list = await listMessageTurns(c.env.DB, sessionId);
  return jsonOk({ page: {}, list });
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

export default app;
