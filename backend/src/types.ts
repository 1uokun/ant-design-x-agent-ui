export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

export type PageList<T> = {
  page?: Record<string, unknown>;
  list: T[];
};

export type ContentItem = {
  type: string;
  text: string;
};

/** 前端可能传 { type, text } 或 { content, mimeType } */
export type RawContentItem =
  | ContentItem
  | { content: string; mimeType?: string; type?: string; text?: string };

export type SessionRow = {
  id: number;
  sessionId: string;
  createTime: string;
  modifyTime: string;
  userId: number;
  title: string;
  lastMessageTime: string;
  pinned: number;
};

export type MessageRow = {
  id: number;
  createTime: string;
  modifyTime: string;
  messageId: string;
  sessionId: string;
  eventType: number;
  modelName: string;
  requestId: string;
  requestTime: string;
  responseId: string;
  responseTime: string;
  feedbackType: number;
};

export type AgentContentRow = {
  id: number;
  createTime: string;
  modifyTime: string;
  sourceType: number;
  sourceId: string;
  content: string | null;
};

export type SessionDto = {
  sessionId: string;
  title: string;
  lastMessageTime: string;
  pinned: boolean;
  createTime: string;
  modifyTime: string;
};

export type MessageTurnDto = {
  sessionId: string;
  messageId: string;
  eventType: number;
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

export type ChatRequestBody = {
  sessionId: string;
  messageId: string;
  requestId: string;
  responseId: string;
  modelName?: string;
  userId?: number;
  requestMessages: RawContentItem[];
};

export type SessionUpdateBody = {
  sessionId: string;
  title?: string;
  pinned?: boolean;
};

export type SessionDeleteBody = {
  sessionId: string;
};

export type MessageDeleteBody = {
  messageId: string;
};

export type AbortBody = {
  sessionId: string;
  messageId: string;
};

export type FeedbackBody = {
  sessionId: string;
  messageId: string;
  feedbackType: "good" | "bad";
};
