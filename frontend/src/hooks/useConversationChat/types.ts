import type { ActionsFeedbackProps } from "@ant-design/x";

export const DEFAULT_USER_ID = 1;
export const DEFAULT_MODEL =
  import.meta.env.VITE_DEFAULT_MODEL || "deepseek-chat";

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
  };
};
