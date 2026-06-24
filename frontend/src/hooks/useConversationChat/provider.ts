import {
  DeepSeekChatProvider,
  XRequest,
  type SSEFields,
  type TransformMessage,
  type XModelMessage,
  type XRequestOptions,
} from "@ant-design/x-sdk";
import { CHAT_API_PATH } from "../../api/config";
import type { ChatMessage, ChatRequestBody, ChatRoundMeta } from "../../api/message";
import { toChatRequestMessages } from "../../api/message";
import { generateMessageId } from "../../utils/id";
import { DEFAULT_MODEL, DEFAULT_USER_ID } from "./types";

export type ChatStreamOutput = Partial<Record<SSEFields, unknown>>;

export type ChatProviderInput = Partial<ChatRequestBody> & {
  userAction?: "send" | "retry";
  messages?: XModelMessage[];
};

let chatXRequest: ReturnType<
  typeof XRequest<ChatProviderInput, ChatStreamOutput, XModelMessage>
> | null = null;

function getChatXRequest() {
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

function extractLastUserMessage(messages: ChatMessage[]): ChatMessage | undefined {
  return [...messages].reverse().find((item) => item.role === "user");
}

function findUserMessageByRound(messages: ChatMessage[], roundMeta: ChatRoundMeta): ChatMessage | undefined {
  return messages.find(
    (item) =>
      item.role === "user" &&
      item.messageId === roundMeta.messageId &&
      item.requestId === roundMeta.requestId,
  );
}

function resolveRoundMeta(
  requestParams: Partial<ChatProviderInput>,
  isRetry: boolean,
): ChatRoundMeta {
  const { messageId, requestId, responseId, modelName } = requestParams;
  if (messageId && requestId && responseId) {
    return {
      messageId,
      requestId,
      responseId,
      modelName: modelName ?? DEFAULT_MODEL,
    };
  }
  if (isRetry) {
    throw new Error("重新生成缺少消息标识");
  }
  return {
    messageId: generateMessageId(),
    requestId: generateMessageId(),
    responseId: generateMessageId(),
    modelName: modelName ?? DEFAULT_MODEL,
  };
}

/**
 * 基于 SDK DeepSeekChatProvider，将 useXChat 请求体转为后端 /api/v1/chat 契约。
 */
class AppDeepSeekChatProvider extends DeepSeekChatProvider<
  XModelMessage,
  ChatProviderInput,
  ChatStreamOutput
> {
  conversationKey: string;
  modelName: string;
  userId: number;
  private pendingRoundMeta: ChatRoundMeta | null = null;

  constructor(conversationKey: string, modelName: string, userId: number) {
    super({ request: getChatXRequest() });
    this.conversationKey = conversationKey;
    this.modelName = modelName;
    this.userId = userId;
  }

  transformParams(
    requestParams: Partial<ChatProviderInput>,
    options: XRequestOptions<ChatProviderInput, ChatStreamOutput, XModelMessage>,
  ): ChatProviderInput {
    const isRetry = requestParams.userAction === "retry";
    const messages = this.getMessages() as ChatMessage[];
    const roundMeta = resolveRoundMeta(requestParams, isRetry);
    const modelName = requestParams.modelName || this.modelName || DEFAULT_MODEL;
    this.pendingRoundMeta = { ...roundMeta, modelName };

    const userMessage = isRetry
      ? findUserMessageByRound(messages, roundMeta)
      : extractLastUserMessage(messages);
    if (!userMessage) {
      throw new Error("未找到用户消息");
    }

    const body: ChatRequestBody = {
      sessionId: this.conversationKey,
      messageId: roundMeta.messageId,
      requestId: roundMeta.requestId,
      responseId: roundMeta.responseId,
      modelName,
      userId: this.userId,
      requestMessages: toChatRequestMessages(userMessage.content),
    };

    return { ...(options?.params || {}), ...body };
  }

  transformLocalMessage(requestParams: Partial<ChatProviderInput>): XModelMessage[] {
    return (requestParams?.messages || []) as XModelMessage[];
  }

  transformMessage(info: TransformMessage<XModelMessage, ChatStreamOutput>): XModelMessage {
    const result = super.transformMessage(info);
    if (this.pendingRoundMeta) {
      return { ...result, ...this.pendingRoundMeta };
    }
    return result;
  }
}

const providerCaches = new Map<string, AppDeepSeekChatProvider>();

export function createDeepSeekChatProvider(
  conversationKey: string,
  options?: { modelName?: string; userId?: number },
) {
  let provider = providerCaches.get(conversationKey);
  if (!provider) {
    provider = new AppDeepSeekChatProvider(
      conversationKey,
      options?.modelName || DEFAULT_MODEL,
      options?.userId ?? DEFAULT_USER_ID,
    );
    providerCaches.set(conversationKey, provider);
  } else if (options?.modelName) {
    provider.modelName = options.modelName;
  }
  return provider;
}
