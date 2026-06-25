import { message } from "antd";
import { createStyles } from "antd-style";
import React, { useRef, useState } from "react";
import "@ant-design/x-markdown/themes/light.css";
import "@ant-design/x-markdown/themes/dark.css";
import { BubbleListRef } from "@ant-design/x/es/bubble";
import { ChatContext } from "./components/ChatContext";
import ChatList from "./components/ChatList";
import ChatWelcome from "./components/Welcome";
import ConversationSide, {
  SIDEBAR_WIDTH,
} from "./components/Conversations/Conversations";
import ChatSender from "./components/Sender";
import ModelSelector from "./components/Conversations/ModelSelector";
import { useConversationChat } from "./hooks/useConversationChat";
import { useMarkdownTheme } from "./hooks/useMarkdownTheme";

const useStyle = createStyles(({ token, css }) => ({
  layout: css`
    width: 100%;
    height: 100vh;
    display: flex;
    background: ${token.colorBgContainer};
    font-family:
      "PingFang SC",
      -apple-system,
      BlinkMacSystemFont,
      "Hiragino Sans GB",
      "Hiragino Sans",
      "SF Pro Text",
      system-ui,
      "Noto Sans SC",
      "Helvetica Neue",
      Helvetica,
      Arial,
      sans-serif;
  `,
  sideWrapper: css`
    flex-shrink: 0;
    width: ${SIDEBAR_WIDTH}px;
    overflow: hidden;
    transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  `,
  sideWrapperCollapsed: css`
    width: 0;
    pointer-events: none;
  `,
  chat: css`
    height: 100%;
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  `,
}));

const Independent: React.FC = () => {
  const { styles, cx } = useStyle();
  const [className] = useMarkdownTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const listRef = useRef<BubbleListRef>(null);

  const {
    conversations,
    activeConversationKey,
    selectConversation,
    messages,
    isRequesting,
    isDefaultMessagesRequesting,
    loadMoreHistory,
    modelKey,
    setModelKey,
    chatModels,
    onReload,
    setMessage,
    onSubmit: submitChat,
    handleAbort,
    handleFeedback,
    handleCreateConversation,
    handleDeleteConversation,
    handleRenameConversation,
    handleTogglePin,
    handleDeleteMessage,
    handleToggleUserMessageEdit,
    handleCancelUserMessageEdit,
    handleEditUserMessage,
  } = useConversationChat({ messageApi });

  const onSubmit = (val: string) => {
    submitChat(val);
    listRef.current?.scrollTo({ top: "bottom" });
  };

  const handleEditUserMessageWithScroll = (
    messageKey: string | number,
    content: string,
  ) => {
    handleEditUserMessage(messageKey, content);
    listRef.current?.scrollTo({ top: "bottom" });
  };

  return (
    <ChatContext.Provider
      value={{
        onReload,
        setMessage,
        sessionId: activeConversationKey,
        loadMoreHistory,
        onFeedback: handleFeedback,
        onDeleteMessage: handleDeleteMessage,
        onToggleUserMessageEdit: handleToggleUserMessageEdit,
        onEditUserMessage: handleEditUserMessageWithScroll,
        onCancelUserMessageEdit: handleCancelUserMessageEdit,
      }}
    >
      {contextHolder}
      <div className={styles.layout}>
        <div
          className={cx(
            styles.sideWrapper,
            sidebarCollapsed && styles.sideWrapperCollapsed,
          )}
          aria-hidden={sidebarCollapsed}
        >
          <ConversationSide
            conversations={conversations}
            activeConversationKey={activeConversationKey}
            onSelect={selectConversation}
            onCreate={handleCreateConversation}
            onDelete={handleDeleteConversation}
            onRename={handleRenameConversation}
            onTogglePin={handleTogglePin}
            onToggleCollapse={() => setSidebarCollapsed(true)}
          />
        </div>
        <div className={styles.chat}>
          <ModelSelector
            value={modelKey}
            onChange={setModelKey}
            models={chatModels}
            disabled={isRequesting}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed(false)}
          />
          <ChatList
            listRef={listRef}
            isDefaultMessagesRequesting={isDefaultMessagesRequesting}
            messages={messages}
            className={className}
            onEditUserMessage={handleEditUserMessageWithScroll}
            onCancelUserMessageEdit={handleCancelUserMessageEdit}
          />
          <ChatWelcome
            visible={!activeConversationKey && !isDefaultMessagesRequesting}
          >
            <ChatSender
              activeConversationKey={activeConversationKey}
              isRequesting={isRequesting}
              onSubmit={onSubmit}
              onCancel={handleAbort}
            />
          </ChatWelcome>
        </div>
      </div>
    </ChatContext.Provider>
  );
};

export default Independent;
