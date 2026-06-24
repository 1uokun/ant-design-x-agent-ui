import { message } from "antd";
import { createStyles } from "antd-style";
import React, { useRef } from "react";
import "@ant-design/x-markdown/themes/light.css";
import "@ant-design/x-markdown/themes/dark.css";
import { BubbleListRef } from "@ant-design/x/es/bubble";
import { ChatContext } from "./components/ChatContext";
import ChatList from "./components/ChatList";
import ConversationSide from "./components/Conversations";
import ChatSender from "./components/Sender";
import { useConversationChat } from "./hooks/useConversationChat";
import { useMarkdownTheme } from "./hooks/useMarkdownTheme";

const useStyle = createStyles(({ token, css }) => ({
  layout: css`
    width: 100%;
    height: 100vh;
    display: flex;
    background: ${token.colorBgContainer};
    font-family: AlibabaPuHuiTi, ${token.fontFamily}, sans-serif;
  `,
  chat: css`
    height: 100%;
    width: calc(100% - 280px);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    .ant-bubble-content-updating {
      background-image: linear-gradient(
        90deg,
        #ff6b23 0%,
        #af3cb8 31%,
        #53b6ff 89%
      );
      background-size: 100% 2px;
      background-repeat: no-repeat;
      background-position: bottom;
    }
  `,
}));

const Independent: React.FC = () => {
  const { styles } = useStyle();
  const [className] = useMarkdownTheme();
  const [messageApi, contextHolder] = message.useMessage();
  const listRef = useRef<BubbleListRef>(null);

  const {
    conversations,
    activeConversationKey,
    selectConversation,
    messages,
    isRequesting,
    isDefaultMessagesRequesting,
    onReload,
    setMessage,
    onSubmit: submitChat,
    handleAbort,
    handleFeedback,
    handleCreateConversation,
    handleDeleteConversation,
    handleRenameConversation,
  } = useConversationChat({ messageApi });

  const onSubmit = (val: string) => {
    submitChat(val);
    listRef.current?.scrollTo({ top: "bottom" });
  };

  return (
    <ChatContext.Provider
      value={{
        onReload,
        setMessage,
        sessionId: activeConversationKey,
        onFeedback: handleFeedback,
      }}
    >
      {contextHolder}
      <div className={styles.layout}>
        <ConversationSide
          conversations={conversations}
          activeConversationKey={activeConversationKey}
          onSelect={selectConversation}
          onCreate={handleCreateConversation}
          onDelete={handleDeleteConversation}
          onRename={handleRenameConversation}
        />
        <div className={styles.chat}>
          <ChatList
            listRef={listRef}
            isDefaultMessagesRequesting={isDefaultMessagesRequesting}
            messages={messages}
            className={className}
            onSubmit={onSubmit}
          />
          <ChatSender
            activeConversationKey={activeConversationKey}
            isRequesting={isRequesting}
            onSubmit={onSubmit}
            onCancel={handleAbort}
          />
        </div>
      </div>
    </ChatContext.Provider>
  );
};

export default Independent;
