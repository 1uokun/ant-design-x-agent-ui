import type { DefaultMessageInfo, MessageInfo } from "@ant-design/x-sdk";
import { fetchMessageList } from "../../api/message";
import { prependChatMessageInfos, turnsToChatMessageInfos } from "./adapters";
import type { AppChatMessage } from "./types";
import { MESSAGE_PAGE_SIZE } from "./types";

type Cursor = { page: number; pageSize: number; hasMore: boolean };
const cursors = new Map<string, Cursor>();
let loadingSessionId: string | null = null;

async function fetchPage(sessionId: string, page: number) {
  const { list, page: pageInfo } = await fetchMessageList(sessionId, {
    page,
    pageSize: MESSAGE_PAGE_SIZE,
    order: "desc",
  });
  cursors.set(sessionId, {
    page: pageInfo.page,
    pageSize: pageInfo.pageSize,
    hasMore: pageInfo.hasMore,
  });
  return turnsToChatMessageInfos(list) as DefaultMessageInfo<AppChatMessage>[];
}

export async function fetchFirstHistoryPage(sessionId: string) {
  return fetchPage(sessionId, 1);
}

export function appendHistoryPage(
  sessionId: string,
  setMessages: (
    updater: (
      current: MessageInfo<AppChatMessage>[],
    ) => MessageInfo<AppChatMessage>[],
  ) => void,
  onError: () => void,
) {
  const cursor = cursors.get(sessionId);
  if (!cursor?.hasMore || loadingSessionId === sessionId) return;

  loadingSessionId = sessionId;
  fetchPage(sessionId, cursor.page + 1)
    .then((older) => {
      setMessages((current) =>
        prependChatMessageInfos(
          current,
          older as MessageInfo<AppChatMessage>[],
        ) as MessageInfo<AppChatMessage>[],
      );
    })
    .catch(onError)
    .finally(() => {
      if (loadingSessionId === sessionId) loadingSessionId = null;
    });
}
