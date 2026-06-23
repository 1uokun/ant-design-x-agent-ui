import dayjs from "dayjs";
import type { Conversation, Session } from "../api/message";

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
