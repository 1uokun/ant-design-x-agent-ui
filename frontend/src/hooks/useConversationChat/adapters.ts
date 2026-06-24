import dayjs from "dayjs";
import {
  EventType,
  type ChatMessageInfo,
  type ContentItem,
  type Conversation,
  type MessageContent,
  type MessageStatus,
  type MessageTurn,
  type Session,
} from "../../api/message";

// --- 会话列表：后端 Session ↔ 侧边栏 Conversation ---

export const getConversationGroupByTime = (time?: string): string => {
  if (!time || time.startsWith("1970")) return "更早";
  const date = dayjs(time);
  if (!date.isValid()) return "更早";

  const daysAgo = dayjs().startOf("day").diff(date.startOf("day"), "day");
  if (daysAgo <= 0) return "今天";
  if (daysAgo === 1) return "昨天";
  if (daysAgo >= 5) return "更早";
  return date.format("YYYY-MM-DD");
};

export const getConversationGroupSortKey = (group: string): number => {
  if (group === "置顶") return -1;
  if (group === "今天") return 0;
  if (group === "昨天") return 1;
  if (group === "更早") return Number.MAX_SAFE_INTEGER;
  const date = dayjs(group, "YYYY-MM-DD", true);
  if (date.isValid()) {
    return dayjs().startOf("day").diff(date.startOf("day"), "day");
  }
  return Number.MAX_SAFE_INTEGER - 1;
};

export function sessionToConversation(session: Session): Conversation {
  return {
    key: session.sessionId,
    label: session.title || `会话 ${session.sessionId.slice(0, 8)}`,
    group: session.pinned ? "置顶" : getConversationGroupByTime(session.lastMessageTime),
    pinned: session.pinned,
    lastMessageTime: session.lastMessageTime,
  };
}

export function buildLocalConversation(sessionId: string, text: string): Conversation {
  const now = new Date().toISOString();
  return {
    key: sessionId,
    label: text.trim().slice(0, 15) || "新对话",
    group: "今天",
    lastMessageTime: now,
  };
}

export function mergeServerAndLocalConversations(
  serverList: Conversation[],
  localList: Conversation[],
): Conversation[] {
  const serverKeys = new Set(serverList.map((item) => item.key));
  const pendingLocal = localList.filter((item) => !serverKeys.has(item.key));
  return [...pendingLocal, ...serverList];
}

// --- 消息：后端 MessageTurn ↔ useXChat 消息列表 ---

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

export function turnsToChatMessageInfos(turns: MessageTurn[]): ChatMessageInfo[] {
  return turns.flatMap((turn) => {
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
  });
}
