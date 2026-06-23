import {
  EventType,
  type ChatMessageInfo,
  type ContentItem,
  type MessageContent,
  type MessageTurn,
  type MessageStatus,
} from "../api/message";

const itemsToText = (items: ContentItem[]) =>
  items
    .map((item) => item.text)
    .filter(Boolean)
    .join("\n");

const itemsToUserContent = (items: ContentItem[]): string | MessageContent => {
  const textParts: string[] = [];
  const imageUrls: string[] = [];

  for (const item of items) {
    if (!item.text) continue;
    if (item.type?.startsWith("image/")) {
      imageUrls.push(item.text);
    } else {
      textParts.push(item.text);
    }
  }

  const text = textParts.join("\n");
  if (imageUrls.length > 0) {
    return { ...(text ? { text } : {}), imageUrls };
  }
  return text;
};

const hasUserContent = (content: string | MessageContent): boolean => {
  if (typeof content === "string") return Boolean(content);
  return Boolean(content.text || content.imageUrls?.length);
};

const eventTypeToStatus = (eventType: number): MessageStatus => {
  switch (eventType) {
    case EventType.COMPLETE:
      return "success";
    case EventType.ABORT:
      return "abort";
    case EventType.ERROR:
      return "error";
    case EventType.STREAMING:
      return "loading";
    default:
      return "success";
  }
};

export function turnToChatMessageInfos(turn: MessageTurn): ChatMessageInfo[] {
  const roundMeta = {
    messageId: turn.messageId,
    requestId: turn.requestId,
    responseId: turn.responseId,
    modelName: turn.modelName,
  };

  const messages: ChatMessageInfo[] = [];
  const requestContent = itemsToUserContent(turn.requestMessages);

  if (hasUserContent(requestContent)) {
    messages.push({
      id: `${turn.messageId}-request`,
      status: "success",
      message: {
        role: "user",
        content: requestContent,
        requestTime: turn.requestTime,
        ...roundMeta,
      },
    });
  }

  if (turn.eventType === EventType.STREAMING) {
    return messages;
  }

  const responseText = itemsToText(turn.responseMessages);
  const assistantStatus = eventTypeToStatus(turn.eventType);
  const shouldIncludeAssistant =
    Boolean(responseText) ||
    hasUserContent(requestContent) ||
    turn.eventType === EventType.ABORT ||
    turn.eventType === EventType.ERROR;

  if (shouldIncludeAssistant) {
    messages.push({
      id: turn.messageId,
      status: assistantStatus,
      message: {
        role: "assistant",
        content: responseText,
        responseTime: turn.responseTime,
        feedbackType: turn.feedbackType ?? undefined,
        ...roundMeta,
      },
    });
  }

  return messages;
}

export function turnsToChatMessageInfos(turns: MessageTurn[]): ChatMessageInfo[] {
  return turns.flatMap(turnToChatMessageInfos);
}
