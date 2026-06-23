/**
 * API概览:
 * 会话管理:    api/v1/session/page/list
 * 消息列表:    api/v1/session/msg/list
 * stream api: api/v1/chat
 * **/

/** 统一响应外壳 */
export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

/** 分页列表 */
export type PageList<T> = {
  page?: Record<string, unknown>;
  list: T[];
};

/** 消息 UI 状态 */
export type MessageStatus =
  | "local"
  | "loading"
  | "updating"
  | "success"
  | "error"
  | "abort";

/** 与 x_message.eventType 对齐 */
export const EventType = {
  STREAMING: 0,
  COMPLETE: 1,
  ABORT: 2,
  ERROR: 3,
  RETRY: 4,
} as const;

export type EventTypeValue = (typeof EventType)[keyof typeof EventType];

export type ContentItem = {
  type: string;
  text: string;
};

export type Session = {
  sessionId: string;
  title: string;
  lastMessageTime: string;
  pinned: boolean;
  createTime: string;
  modifyTime: string;
};

export type SessionUpdatePayload = {
  title?: string;
  pinned?: boolean;
};

/** 一轮 Q&A（x_message + agent_content） */
export type MessageTurn = {
  sessionId: string;
  messageId: string;
  eventType: EventTypeValue;
  modelName: string;
  requestId: string;
  responseId: string;
  requestMessages: ContentItem[];
  responseMessages: ContentItem[];
  requestTime: string;
  responseTime: string;
  feedbackType: "good" | "bad" | null;
  createTime?: string;
  modifyTime?: string;
};

/** Ant Design X Sessions 列表项 */
export type Conversation = {
  key: string;
  label: string;
  group?: string;
  pinned?: boolean;
  lastMessageTime?: string;
};

export type MessageContent = {
  text?: string;
  imageUrls?: string[];
};

export type TurnIds = {
  sessionId: string;
  messageId: string;
  requestId: string;
  responseId: string;
  modelName: string;
};

export type ChatMessage = {
  role: string;
  content: string | MessageContent;
  messageId?: string;
  requestId?: string;
  responseId?: string;
  modelName?: string;
  requestTime?: string;
  responseTime?: string;
  feedbackType?: string;
};

export type ChatRequestInput = ChatRoundMeta & {
  messages?: ChatMessage[];
  userAction?: "send" | "retry";
};

export type ChatMessageInfo = {
  id?: string | number;
  status?: MessageStatus;
  message: ChatMessage;
};

export type ChatSubmitPayload = {
  text: string;
  imageUrls: string[];
};

export type ChatRequestBody = {
  sessionId: string;
  messageId: string;
  requestId: string;
  responseId: string;
  modelName: string;
  userId?: number;
  requestMessages: ContentItem[];
};

export type AbortPayload = {
  sessionId: string;
  messageId: string;
};

export type FeedbackPayload = {
  sessionId: string;
  messageId: string;
  feedbackType: "good" | "bad";
};

export type UploadResult = {
  url: string;
};

/** 一轮对话 ID（不含 sessionId） */
export type ChatRoundMeta = Omit<TurnIds, "sessionId">;

export function createChatRoundMeta(modelName = "deepseek-chat"): ChatRoundMeta {
  return {
    messageId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    responseId: crypto.randomUUID(),
    modelName,
  };
}

export function toChatRequestMessages(
  content: string | MessageContent,
): ContentItem[] {
  if (typeof content === "string") {
    return [{ type: "text/plain", text: content }];
  }

  const messages: ContentItem[] = [];
  if (content.text) {
    messages.push({ type: "text/plain", text: content.text });
  }
  for (const url of content.imageUrls || []) {
    messages.push({ type: "image/jpeg", text: url });
  }
  return messages;
}

export function buildChatRequestParams(
  content: string | MessageContent,
  roundMeta: ChatRoundMeta,
): ChatRequestInput {
  return {
    ...roundMeta,
    messages: [{ role: "user", content, ...roundMeta }],
  };
}

const API_BASE = "/api/v1";

async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  return res.json() as Promise<ApiResponse<T>>;
}

/** 会话列表 */
export async function fetchSessionList(userId: number) {
  const res = await requestJson<PageList<Session>>(
    `/session/page/list?userId=${encodeURIComponent(String(userId))}`,
  );
  if (!res.success || !res.data) {
    throw new Error(res.message ?? "fetchSessionList failed");
  }
  return res.data.list;
}

/** 更新会话 */
export async function updateSession(sessionId: string, payload: SessionUpdatePayload) {
  const res = await requestJson<boolean>("/session/update", {
    method: "POST",
    body: JSON.stringify({ sessionId, ...payload }),
  });
  if (!res.success) throw new Error(res.message ?? "updateSession failed");
  return res.data;
}

/** 删除会话 */
export async function deleteSession(sessionId: string) {
  const res = await requestJson<boolean>("/session/delete", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
  if (!res.success) throw new Error(res.message ?? "deleteSession failed");
  return res.data;
}

/** 消息轮次列表 */
export async function fetchMessageList(sessionId: string) {
  const res = await requestJson<PageList<MessageTurn>>(
    `/session/msg/list?sessionId=${encodeURIComponent(sessionId)}`,
  );
  if (!res.success || !res.data) {
    throw new Error(res.message ?? "fetchMessageList failed");
  }
  return res.data.list;
}

/** 删除一轮对话 */
export async function deleteMessage(messageId: string) {
  const res = await requestJson<boolean>("/session/msg/delete", {
    method: "POST",
    body: JSON.stringify({ messageId }),
  });
  if (!res.success) throw new Error(res.message ?? "deleteMessage failed");
  return res.data;
}

/** 消息反馈 */
export async function submitFeedback(payload: FeedbackPayload) {
  const res = await requestJson<boolean>("/session/msg/feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.success) throw new Error(res.message ?? "submitFeedback failed");
  return res.data;
}

/** 停止流式生成（需在 useXChat.abort() 之前调用） */
export async function abortChat(payload: AbortPayload) {
  const res = await requestJson<boolean>("/chat/abort", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.success) throw new Error(res.message ?? "abortChat failed");
  return res.data;
}
