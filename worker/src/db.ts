import { SourceType } from "./constants";
import {
  feedbackToApi,
  normalizeContentItems,
  parseContent,
  serializeContent,
} from "./content";
import type {
  AgentContentRow,
  ChatRequestBody,
  ContentItem,
  MessageRow,
  MessageTurnDto,
  SessionDto,
  SessionRow,
} from "./types";
import { nowIso, truncateTitle } from "./utils";

export async function listSessions(
  db: D1Database,
  userId: number,
): Promise<SessionDto[]> {
  const { results } = await db
    .prepare(
      `SELECT sessionId, title, lastMessageTime, pinned, createTime, modifyTime
       FROM x_session
       WHERE userId = ?
       ORDER BY pinned DESC, lastMessageTime DESC`,
    )
    .bind(userId)
    .all<Pick<SessionRow, "sessionId" | "title" | "lastMessageTime" | "pinned" | "createTime" | "modifyTime">>();

  return (results ?? []).map((row) => ({
    sessionId: row.sessionId,
    title: row.title,
    lastMessageTime: row.lastMessageTime,
    pinned: row.pinned === 1,
    createTime: row.createTime,
    modifyTime: row.modifyTime,
  }));
}

export async function getSessionBySessionId(
  db: D1Database,
  sessionId: string,
): Promise<SessionRow | null> {
  return db
    .prepare("SELECT * FROM x_session WHERE sessionId = ?")
    .bind(sessionId)
    .first<SessionRow>();
}

export async function upsertSession(
  db: D1Database,
  params: {
    sessionId: string;
    userId: number;
    title?: string;
    lastMessageTime?: string;
  },
): Promise<void> {
  const existing = await getSessionBySessionId(db, params.sessionId);
  const now = nowIso();

  if (!existing) {
    await db
      .prepare(
        `INSERT INTO x_session (sessionId, userId, title, lastMessageTime, createTime, modifyTime)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        params.sessionId,
        params.userId,
        params.title ?? "新对话",
        params.lastMessageTime ?? now,
        now,
        now,
      )
      .run();
    return;
  }

  await db
    .prepare(
      `UPDATE x_session
       SET lastMessageTime = ?, modifyTime = ?, title = COALESCE(?, title)
       WHERE sessionId = ?`,
    )
    .bind(params.lastMessageTime ?? now, now, params.title ?? null, params.sessionId)
    .run();
}

export async function updateSession(
  db: D1Database,
  sessionId: string,
  patch: { title?: string; pinned?: boolean },
): Promise<boolean> {
  const existing = await getSessionBySessionId(db, sessionId);
  if (!existing) return false;

  const now = nowIso();
  const title = patch.title ?? existing.title;
  const pinned = patch.pinned === undefined ? existing.pinned : patch.pinned ? 1 : 0;

  await db
    .prepare(
      `UPDATE x_session SET title = ?, pinned = ?, modifyTime = ? WHERE sessionId = ?`,
    )
    .bind(title, pinned, now, sessionId)
    .run();
  return true;
}

export async function deleteSession(db: D1Database, sessionId: string): Promise<boolean> {
  const existing = await getSessionBySessionId(db, sessionId);
  if (!existing) return false;

  const messages = await db
    .prepare("SELECT requestId, responseId FROM x_message WHERE sessionId = ?")
    .bind(sessionId)
    .all<Pick<MessageRow, "requestId" | "responseId">>();

  const sourceIds = (messages.results ?? []).flatMap((m) => [m.requestId, m.responseId]);

  if (sourceIds.length > 0) {
    const placeholders = sourceIds.map(() => "?").join(", ");
    await db
      .prepare(`DELETE FROM agent_content WHERE sourceId IN (${placeholders})`)
      .bind(...sourceIds)
      .run();
  }

  await db.prepare("DELETE FROM x_message WHERE sessionId = ?").bind(sessionId).run();
  await db.prepare("DELETE FROM x_session WHERE sessionId = ?").bind(sessionId).run();
  return true;
}

export async function getMessageByMessageId(
  db: D1Database,
  messageId: string,
): Promise<MessageRow | null> {
  return db
    .prepare("SELECT * FROM x_message WHERE messageId = ?")
    .bind(messageId)
    .first<MessageRow>();
}

export async function upsertAgentContent(
  db: D1Database,
  sourceType: number,
  sourceId: string,
  items: ContentItem[],
): Promise<void> {
  const now = nowIso();
  const content = serializeContent(items);
  const existing = await db
    .prepare("SELECT id FROM agent_content WHERE sourceId = ? AND sourceType = ?")
    .bind(sourceId, sourceType)
    .first<{ id: number }>();

  if (existing) {
    await db
      .prepare(
        `UPDATE agent_content SET content = ?, modifyTime = ? WHERE sourceId = ? AND sourceType = ?`,
      )
      .bind(content, now, sourceId, sourceType)
      .run();
    return;
  }

  await db
    .prepare(
      `INSERT INTO agent_content (sourceType, sourceId, content, createTime, modifyTime)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(sourceType, sourceId, content, now, now)
    .run();
}

export async function deleteAgentContentBySourceId(
  db: D1Database,
  sourceId: string,
  sourceType?: number,
): Promise<void> {
  if (sourceType !== undefined) {
    await db
      .prepare("DELETE FROM agent_content WHERE sourceId = ? AND sourceType = ?")
      .bind(sourceId, sourceType)
      .run();
    return;
  }
  await db.prepare("DELETE FROM agent_content WHERE sourceId = ?").bind(sourceId).run();
}

export async function createMessage(
  db: D1Database,
  params: {
    messageId: string;
    sessionId: string;
    eventType: number;
    modelName: string;
    requestId: string;
    responseId: string;
    requestTime: string;
  },
): Promise<void> {
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO x_message (
        messageId, sessionId, eventType, modelName, requestId, requestTime,
        responseId, responseTime, feedbackType, createTime, modifyTime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .bind(
      params.messageId,
      params.sessionId,
      params.eventType,
      params.modelName,
      params.requestId,
      params.requestTime,
      params.responseId,
      "1970-01-01T00:00:00.000Z",
      now,
      now,
    )
    .run();
}

export async function resetMessageForRegenerate(
  db: D1Database,
  messageId: string,
): Promise<void> {
  const now = nowIso();
  await db
    .prepare(
      `UPDATE x_message
       SET eventType = 0, feedbackType = 0, responseTime = '1970-01-01T00:00:00.000Z', modifyTime = ?
       WHERE messageId = ?`,
    )
    .bind(now, messageId)
    .run();
}

export async function updateMessageFinalize(
  db: D1Database,
  messageId: string,
  eventType: number,
  responseTime: string,
): Promise<boolean> {
  const now = nowIso();
  const result = await db
    .prepare(
      `UPDATE x_message
       SET eventType = ?, responseTime = ?, modifyTime = ?
       WHERE messageId = ? AND eventType = 0`,
    )
    .bind(eventType, responseTime, now, messageId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function updateFeedback(
  db: D1Database,
  sessionId: string,
  messageId: string,
  feedbackType: number,
): Promise<boolean> {
  const now = nowIso();
  const result = await db
    .prepare(
      `UPDATE x_message SET feedbackType = ?, modifyTime = ?
       WHERE messageId = ? AND sessionId = ?`,
    )
    .bind(feedbackType, now, messageId, sessionId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function deleteMessage(db: D1Database, messageId: string): Promise<boolean> {
  const message = await getMessageByMessageId(db, messageId);
  if (!message) return false;

  await deleteAgentContentBySourceId(db, message.requestId);
  await deleteAgentContentBySourceId(db, message.responseId);
  await db.prepare("DELETE FROM x_message WHERE messageId = ?").bind(messageId).run();
  return true;
}

async function loadContentsBySourceIds(
  db: D1Database,
  sourceIds: string[],
): Promise<Map<string, ContentItem[]>> {
  const map = new Map<string, ContentItem[]>();
  if (sourceIds.length === 0) return map;

  const placeholders = sourceIds.map(() => "?").join(", ");
  const { results } = await db
    .prepare(`SELECT sourceId, content FROM agent_content WHERE sourceId IN (${placeholders})`)
    .bind(...sourceIds)
    .all<Pick<AgentContentRow, "sourceId" | "content">>();

  for (const row of results ?? []) {
    map.set(row.sourceId, parseContent(row.content));
  }
  return map;
}

export async function listMessageTurns(
  db: D1Database,
  sessionId: string,
): Promise<MessageTurnDto[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM x_message
       WHERE sessionId = ?
       ORDER BY requestTime ASC, id ASC`,
    )
    .bind(sessionId)
    .all<MessageRow>();

  const messages = results ?? [];
  const sourceIds = messages.flatMap((m) => [m.requestId, m.responseId]);
  const contentMap = await loadContentsBySourceIds(db, sourceIds);

  return messages.map((m) => ({
    sessionId: m.sessionId,
    messageId: m.messageId,
    eventType: m.eventType,
    modelName: m.modelName,
    requestId: m.requestId,
    responseId: m.responseId,
    requestMessages: contentMap.get(m.requestId) ?? [],
    responseMessages: contentMap.get(m.responseId) ?? [],
    requestTime: m.requestTime,
    responseTime: m.responseTime,
    feedbackType: feedbackToApi(m.feedbackType),
    createTime: m.createTime,
    modifyTime: m.modifyTime,
  }));
}

export async function prepareChat(
  db: D1Database,
  body: ChatRequestBody,
): Promise<{ requestMessages: ContentItem[]; isRegenerate: boolean }> {
  const requestMessages = normalizeContentItems(body.requestMessages ?? []);
  const userId = body.userId ?? 0;
  const modelName = body.modelName ?? "";
  const now = nowIso();
  const title = truncateTitle(requestMessages[0]?.text ?? "");

  await upsertSession(db, {
    sessionId: body.sessionId,
    userId,
    title,
    lastMessageTime: now,
  });

  const existing = await getMessageByMessageId(db, body.messageId);

  if (existing) {
    if (
      existing.sessionId !== body.sessionId ||
      existing.requestId !== body.requestId ||
      existing.responseId !== body.responseId
    ) {
      throw new Error("重新生成时 sessionId / requestId / responseId 必须与库中一致");
    }
    if (existing.eventType === 0) {
      const err = new Error("该轮对话正在生成中");
      (err as Error & { status?: number }).status = 409;
      throw err;
    }

    await resetMessageForRegenerate(db, body.messageId);
    await deleteAgentContentBySourceId(db, body.responseId, SourceType.ASSISTANT);
    await upsertAgentContent(db, SourceType.USER, body.requestId, requestMessages);

    return { requestMessages, isRegenerate: true };
  }

  await upsertAgentContent(db, SourceType.USER, body.requestId, requestMessages);
  await createMessage(db, {
    messageId: body.messageId,
    sessionId: body.sessionId,
    eventType: 0,
    modelName,
    requestId: body.requestId,
    responseId: body.responseId,
    requestTime: now,
  });

  return { requestMessages, isRegenerate: false };
}

export async function buildChatHistory(
  db: D1Database,
  sessionId: string,
  currentRequestId: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const turns = await listMessageTurns(db, sessionId);
  const history: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const turn of turns) {
    if (turn.requestId === currentRequestId) break;
    if (turn.eventType !== 1 && turn.eventType !== 2) continue;

    const userText = turn.requestMessages.map((m) => m.text).join("\n").trim();
    const assistantText = turn.responseMessages.map((m) => m.text).join("\n").trim();

    if (userText) history.push({ role: "user", content: userText });
    if (assistantText) history.push({ role: "assistant", content: assistantText });
  }

  return history;
}
