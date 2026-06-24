import type { BubbleListProps } from "@ant-design/x";
import { Bubble } from "@ant-design/x";
import type { DefaultMessageInfo } from "@ant-design/x-sdk";
import { Flex } from "antd";
import { createStyles } from "antd-style";
import React from "react";
import { BubbleListRef } from "@ant-design/x/es/bubble";
import locale from "../_utils/local";
import type { AppChatMessage } from "../hooks/useConversationChat";
import { getAssistantRole } from "./BubbleAssistant";
import { getUserRole } from "./BubbleUser";
import ChatWelcome from "./Welcome";

const useStyle = createStyles(({ css }) => ({
  chatList: css`
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  `,
}));

const getRole = (className: string): BubbleListProps["role"] => ({
  assistant: getAssistantRole(className),
  user: getUserRole(),
});

export type ChatListProps = {
  listRef: React.RefObject<BubbleListRef>;
  isDefaultMessagesRequesting: boolean;
  messages?: DefaultMessageInfo<AppChatMessage>[];
  className: string;
  onSubmit: (val: string) => void;
};

const ChatList: React.FC<ChatListProps> = ({
  listRef,
  isDefaultMessagesRequesting,
  messages,
  className,
  onSubmit,
}) => {
  const { styles } = useStyle();

  return (
    <div className={styles.chatList}>
      {isDefaultMessagesRequesting ? (
        <Flex align="center" justify="center" style={{ flex: 1 }}>
          <span>{locale.noData}</span>
        </Flex>
      ) : messages?.length ? (
        <Bubble.List
          ref={listRef}
          items={messages.map((i) => ({
            ...i.message,
            key: i.id!,
            status: i.status,
            loading: i.status === "loading",
            extraInfo: i.extraInfo,
          }))}
          styles={{
            root: {
              maxWidth: 940,
            },
          }}
          role={getRole(className)}
        />
      ) : (
        <ChatWelcome onSubmit={onSubmit} />
      )}
    </div>
  );
};

export default ChatList;
