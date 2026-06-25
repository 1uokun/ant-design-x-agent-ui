import dayjs from "dayjs";
import locale from "../../_utils/local";
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
  if (!time || time.startsWith("1970")) return locale.earlier;
  const date = dayjs(time);
  if (!date.isValid()) return locale.earlier;

  const daysAgo = dayjs().startOf("day").diff(date.startOf("day"), "day");
  if (daysAgo <= 0) return locale.today;
  if (daysAgo === 1) return locale.yesterday;
  if (daysAgo >= 5) return locale.earlier;
  return date.format("YYYY-MM-DD");
};

export const getConversationGroupSortKey = (group: string): number => {
  if (group === locale.pinned) return -1;
  if (group === locale.today) return 0;
  if (group === locale.yesterday) return 1;
  if (group === locale.earlier) return Number.MAX_SAFE_INTEGER;
  const date = dayjs(group, "YYYY-MM-DD", true);
  if (date.isValid()) {
    return dayjs().startOf("day").diff(date.startOf("day"), "day");
  }
  return Number.MAX_SAFE_INTEGER - 1;
};

export function sessionToConversation(session: Session): Conversation {
  return {
    key: session.sessionId,
    label: session.title || `${locale.session} ${session.sessionId.slice(0, 8)}`,
    group: session.pinned ? locale.pinned : getConversationGroupByTime(session.lastMessageTime),
    pinned: session.pinned,
    lastMessageTime: session.lastMessageTime,
  };
}

export function buildLocalConversation(sessionId: string, text: string): Conversation {
  const now = new Date().toISOString();
  return {
    key: sessionId,
    label: text.trim().slice(0, 15) || locale.newConversation,
    group: locale.today,
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

/** 根据 stream-buffer 响应计算 assistant 气泡状态 */
export function assistantStatusFromStreamBuffer(
  eventType: number,
  text: string,
): MessageStatus {
  if (eventType === EventType.STREAMING) {
    return text ? "updating" : "loading";
  }
  return eventTypeToStatus(eventType);
}

export function prependChatMessageInfos<T extends { id?: string | number }>(
  existing: T[],
  older: T[],
): T[] {
  if (older.length === 0) return existing;
  const existingIds = new Set(existing.map((item) => item.id));
  const toPrepend = older.filter(
    (item) => item.id != null && !existingIds.has(item.id),
  );
  if (toPrepend.length === 0) return existing;
  return [...toPrepend, ...existing];
}

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
      const responseText = itemsToText(turn.responseMessages);
      messages.push({
        id: turn.messageId,
        status: responseText ? "updating" : "loading",
        message: {
          role: "assistant",
          content: responseText,
          responseTime: turn.responseTime,
          ...roundMeta,
        },
      });
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
