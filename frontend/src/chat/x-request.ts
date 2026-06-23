import { XRequest, type SSEFields, type XModelMessage } from "@ant-design/x-sdk";
import type { ChatRequestBody } from "../api/message";
import { CHAT_API_PATH } from "./constants";

export type ChatStreamOutput = Partial<Record<SSEFields, unknown>>;

export type ChatProviderInput = Partial<ChatRequestBody> & {
  userAction?: "send" | "retry";
  messages?: XModelMessage[];
};

/**
 * 流式对话请求实例。
 * XRequest 内部已使用 XStream 解析 SSE，无需单独引入 XStream。
 */
let chatXRequest: ReturnType<
  typeof XRequest<ChatProviderInput, ChatStreamOutput, XModelMessage>
> | null = null;

export function getChatXRequest() {
  if (!chatXRequest) {
    chatXRequest = XRequest<ChatProviderInput, ChatStreamOutput, XModelMessage>(
      CHAT_API_PATH,
      {
        manual: true,
        headers: { Accept: "text/event-stream" },
      },
    );
  }
  return chatXRequest;
}
