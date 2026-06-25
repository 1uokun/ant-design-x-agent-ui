import type { BubbleListProps } from "@ant-design/x";
import { Bubble } from "@ant-design/x";
import type { DefaultMessageInfo } from "@ant-design/x-sdk";
import { Spin } from "antd";
import { createStyles } from "antd-style";
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { BubbleListRef } from "@ant-design/x/es/bubble";
import type { BubbleItemType } from "@ant-design/x/es/bubble/interface";
import type { AppChatMessage } from "../hooks/useConversationChat";
import { getAssistantRole } from "./Bubble/Assistant";
import {
  createUserRole,
  findFirstUserMessageKey,
  findLastUserMessageKey,
  getEditableText,
  isLastRoundComplete,
} from "./Bubble/User";

const USER_MESSAGE_EDIT_MAX_HEIGHT = 150;

const feedbackTypeToActionValue = (
  feedbackType?: string,
): NonNullable<AppChatMessage["extraInfo"]>["feedback"] => {
  if (feedbackType === "good") return "like";
  if (feedbackType === "bad") return "dislike";
  return "default";
};

const isSameExtraInfo = (
  prev?: AppChatMessage["extraInfo"],
  next?: AppChatMessage["extraInfo"],
) => {
  if (prev === next) return true;
  if (!prev || !next) return false;
  return (
    prev.feedback === next.feedback &&
    prev.editing === next.editing &&
    prev.userCanCollapse === next.userCanCollapse &&
    prev.userCollapsed === next.userCollapsed
  );
};

const toBubbleItem = (
  message: DefaultMessageInfo<AppChatMessage>,
): BubbleItemType => {
  const editing = !!message.extraInfo?.editing;
  let content = message.message.content;
  if (message.message.role === "user" && editing) {
    content = getEditableText(content);
  }
  const status = message.status;
  return {
    role: message.message.role,
    content,
    key: message.id!,
    status,
    loading: status === "loading",
    streaming: status === "updating",
    extraInfo: {
      ...message.extraInfo,
      feedback:
        message.extraInfo?.feedback ??
        feedbackTypeToActionValue(message.message.feedbackType),
    },
  };
};

const canReuseBubbleItem = (
  prev: BubbleItemType,
  next: BubbleItemType,
) =>
  prev.content === next.content &&
  prev.status === next.status &&
  prev.loading === next.loading &&
  prev.streaming === next.streaming &&
  isSameExtraInfo(
    prev.extraInfo as AppChatMessage["extraInfo"],
    next.extraInfo as AppChatMessage["extraInfo"],
  );

const useStyle = createStyles(({ css }) => ({
  chatList: css`
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;

    .ant-bubble-list-scroll-content {
      max-width: 840px;
      margin-inline: auto;
    }

    .ant-bubble-list-scroll-content > * {
      content-visibility: auto;
      contain-intrinsic-size: auto 120px;
    }

    .ant-bubble-content-editing > div[contenteditable="true"] {
      white-space: pre-wrap;
      word-break: break-word;
      max-height: ${USER_MESSAGE_EDIT_MAX_HEIGHT}px;
      overflow-y: auto;
      overflow-anchor: none;
      overscroll-behavior: contain;
      box-sizing: border-box;
    }
  `,
}));

export type ChatListProps = {
  listRef: React.RefObject<BubbleListRef>;
  isDefaultMessagesRequesting: boolean;
  messages?: DefaultMessageInfo<AppChatMessage>[];
  className: string;
  onEditUserMessage?: (messageKey: string | number, content: string) => void;
  onCancelUserMessageEdit?: (messageKey: string | number) => void;
};

const ChatList: React.FC<ChatListProps> = ({
  listRef,
  isDefaultMessagesRequesting,
  messages,
  className,
  onEditUserMessage,
  onCancelUserMessageEdit,
}) => {
  const { styles } = useStyle();
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);

  const lastMessageKey = useMemo(
    () => messages?.at(-1)?.id ?? null,
    [messages],
  );
  const firstUserMessageKey = useMemo(
    () => findFirstUserMessageKey(messages),
    [messages],
  );
  const lastUserMessageKey = useMemo(
    () => findLastUserMessageKey(messages),
    [messages],
  );
  const lastRoundComplete = useMemo(
    () => isLastRoundComplete(messages),
    [messages],
  );

  const bubbleItemsCacheRef = useRef(new Map<string | number, BubbleItemType>());

  const bubbleItems = useMemo(() => {
    if (!messages) return [];

    const cache = bubbleItemsCacheRef.current;
    const activeKeys = new Set<string | number>();

    const items = messages.map((message) => {
      const key = message.id!;
      activeKeys.add(key);

      const nextItem = toBubbleItem(message);
      const cached = cache.get(key);
      const item =
        cached && canReuseBubbleItem(cached, nextItem) ? cached : nextItem;

      cache.set(key, item);
      return item;
    });

    for (const key of cache.keys()) {
      if (!activeKeys.has(key)) {
        cache.delete(key);
      }
    }

    return items;
  }, [messages]);

  const role: BubbleListProps["role"] = useMemo(
    () => ({
      assistant: getAssistantRole(className, {
        lastMessageKey,
        isLastRoundComplete: lastRoundComplete,
      }),
      user: createUserRole({
        firstUserMessageKey,
        lastUserMessageKey,
        isLastRoundComplete: lastRoundComplete,
        scrollRoot,
        onEditUserMessage,
        onCancelUserMessageEdit,
      }),
    }),
    [
      className,
      firstUserMessageKey,
      lastMessageKey,
      lastUserMessageKey,
      lastRoundComplete,
      onCancelUserMessageEdit,
      onEditUserMessage,
      scrollRoot,
    ],
  );

  useLayoutEffect(() => {
    setScrollRoot(listRef.current?.scrollBoxNativeElement ?? null);
  }, [listRef, messages, isDefaultMessagesRequesting]);

  if (!messages || messages.length === 0) return null;

  return (
    <div className={styles.chatList}>
      <Spin spinning={isDefaultMessagesRequesting} />
      <Bubble.List ref={listRef} items={bubbleItems} role={role} />
    </div>
  );
};

export default ChatList;
