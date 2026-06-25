import type { ActionsFeedbackProps } from "@ant-design/x";

export const DEFAULT_USER_ID = 1;
export const DEFAULT_MODEL =
  import.meta.env.VITE_DEFAULT_MODEL || "deepseek-v4-flash";

/** 历史消息分页大小（与后端 pageSize 对齐） */
export const MESSAGE_PAGE_SIZE = 10;

export type AppChatMessage = {
  role: string;
  content: string | { text?: string; imageUrls?: string[] };
  messageId?: string;
  requestId?: string;
  responseId?: string;
  modelName?: string;
  requestTime?: string;
  responseTime?: string;
  feedbackType?: string;
  extraInfo?: {
    feedback?: ActionsFeedbackProps["value"];
    userCanCollapse?: boolean;
    userCollapsed?: boolean;
    editing?: boolean;
  };
};
