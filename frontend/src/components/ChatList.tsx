import type { BubbleListProps } from "@ant-design/x";
import { Bubble } from "@ant-design/x";
import type { DefaultMessageInfo } from "@ant-design/x-sdk";
import { Flex } from "antd";
import { createStyles } from "antd-style";
import React, { useMemo } from "react";
import { BubbleListRef } from "@ant-design/x/es/bubble";
import locale from "../_utils/local";
import type { AppChatMessage } from "../hooks/useConversationChat";
import { getAssistantRole } from "./BubbleAssistant";
import {
  createUserRole,
  findLastUserMessageKey,
  getEditableText,
  isLastRoundComplete,
} from "./BubbleUser";
import ChatWelcome from "./Welcome";

const USER_MESSAGE_EDIT_MAX_HEIGHT = 150;

const feedbackTypeToActionValue = (
  feedbackType?: string,
): NonNullable<AppChatMessage["extraInfo"]>["feedback"] => {
  if (feedbackType === "good") return "like";
  if (feedbackType === "bad") return "dislike";
  return "default";
};

const useStyle = createStyles(({ css }) => ({
  chatList: css`
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;

    .ant-bubble-list-scroll-content {
      max-width: 840px;
      margin-inline: auto;
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
  onSubmit: (val: string) => void;
  onEditUserMessage?: (messageKey: string | number, content: string) => void;
  onCancelUserMessageEdit?: (messageKey: string | number) => void;
};

const ChatList: React.FC<ChatListProps> = ({
  listRef,
  isDefaultMessagesRequesting,
  messages,
  className,
  onSubmit,
  onEditUserMessage,
  onCancelUserMessageEdit,
}) => {
  const { styles } = useStyle();

  const lastMessageKey = useMemo(() => messages?.at(-1)?.id ?? null, [messages]);
  const lastUserMessageKey = useMemo(
    () => findLastUserMessageKey(messages),
    [messages],
  );
  const lastRoundComplete = useMemo(
    () => isLastRoundComplete(messages),
    [messages],
  );

  const role: BubbleListProps["role"] = useMemo(
    () => ({
      assistant: getAssistantRole(className, {
        lastMessageKey,
        isLastRoundComplete: lastRoundComplete,
      }),
      user: createUserRole({
        lastUserMessageKey,
        isLastRoundComplete: lastRoundComplete,
        onEditUserMessage,
        onCancelUserMessageEdit,
      }),
    }),
    [
      className,
      lastMessageKey,
      lastUserMessageKey,
      lastRoundComplete,
      onEditUserMessage,
      onCancelUserMessageEdit,
    ],
  );

  return (
    <div className={styles.chatList}>
      {isDefaultMessagesRequesting ? (
        <Flex align="center" justify="center" style={{ flex: 1 }}>
          <span>{locale.noData}</span>
        </Flex>
      ) : messages?.length ? (
        <Bubble.List
          ref={listRef}
          items={messages.map((i) => {
            const editing = !!i.extraInfo?.editing;
            let content = i.message.content;
            if (i.message.role === "user" && editing) {
              content = getEditableText(content);
            }
            return {
              ...i.message,
              content,
              key: i.id!,
              status: i.status,
              loading: i.status === "loading",
              streaming: i.status === "updating",
              extraInfo: {
                ...i.extraInfo,
                feedback:
                  i.extraInfo?.feedback ??
                  feedbackTypeToActionValue(i.message.feedbackType),
              },
            };
          })}
          role={role}
        />
      ) : (
        <ChatWelcome onSubmit={onSubmit} />
      )}
    </div>
  );
};

export default ChatList;
