import {
  DeepSeekChatProvider,
  type TransformMessage,
  type XModelMessage,
  type XRequestOptions,
} from "@ant-design/x-sdk";
import type { ChatMessage, ChatRequestBody, ChatRoundMeta } from "../api/message";
import { toChatRequestMessages } from "../api/message";
import { DEFAULT_MODEL, DEFAULT_USER_ID } from "./constants";
import { getChatXRequest, type ChatProviderInput, type ChatStreamOutput } from "./x-request";
import { generateMessageId } from "../utils/id";

export type { ChatRoundMeta };

export type RequestingNotifier = (conversationKey: string, requesting: boolean) => void;

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
  private notifier: RequestingNotifier | null;
  private pendingRoundMeta: ChatRoundMeta | null = null;

  constructor(
    conversationKey: string,
    modelName: string,
    userId: number,
    notifier: RequestingNotifier | null,
  ) {
    super({ request: getChatXRequest() });
    this.conversationKey = conversationKey;
    this.modelName = modelName;
    this.userId = userId;
    this.notifier = notifier;
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

  injectRequest(callbacks: {
    onUpdate: (data: ChatStreamOutput, responseHeaders: Headers) => unknown;
    onSuccess: (data: ChatStreamOutput[], responseHeaders: Headers) => unknown;
    onError: (error: Error, errorInfo?: unknown) => unknown;
  }): void {
    const notify = (requesting: boolean) => {
      this.notifier?.(this.conversationKey, requesting);
    };

    super.injectRequest({
      onUpdate: (data, responseHeaders) => {
        notify(true);
        return callbacks.onUpdate(data, responseHeaders);
      },
      onSuccess: (data, responseHeaders) => {
        notify(false);
        return callbacks.onSuccess(data, responseHeaders);
      },
      onError: (error, errorInfo) => {
        notify(false);
        return callbacks.onError(error, errorInfo);
      },
    });
  }
}

const providerCaches = new Map<string, AppDeepSeekChatProvider>();

export function createDeepSeekChatProvider(
  conversationKey: string,
  options?: {
    modelName?: string;
    userId?: number;
    notifier?: RequestingNotifier | null;
  },
) {
  let provider = providerCaches.get(conversationKey);
  if (!provider) {
    provider = new AppDeepSeekChatProvider(
      conversationKey,
      options?.modelName || DEFAULT_MODEL,
      options?.userId ?? DEFAULT_USER_ID,
      options?.notifier ?? null,
    );
    providerCaches.set(conversationKey, provider);
  } else if (options?.modelName) {
    provider.modelName = options.modelName;
  }
  return provider;
}
