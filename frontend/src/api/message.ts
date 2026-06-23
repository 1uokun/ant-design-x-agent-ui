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

export type ChatRequestInput = TurnIds & {
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
