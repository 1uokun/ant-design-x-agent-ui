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
import ModelSelector from "./components/ModelSelector";
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
  chat: css`
    height: 100%;
    width: calc(100% - 256px);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
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
    modelKey,
    setModelKey,
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
        onFeedback: handleFeedback,
        onDeleteMessage: handleDeleteMessage,
        onToggleUserMessageEdit: handleToggleUserMessageEdit,
        onEditUserMessage: handleEditUserMessageWithScroll,
        onCancelUserMessageEdit: handleCancelUserMessageEdit,
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
          onTogglePin={handleTogglePin}
        />
        <div className={styles.chat}>
          <ModelSelector
            value={modelKey}
            onChange={setModelKey}
            disabled={isRequesting}
          />
          <ChatList
            listRef={listRef}
            isDefaultMessagesRequesting={isDefaultMessagesRequesting}
            messages={messages}
            className={className}
            onSubmit={onSubmit}
            onEditUserMessage={handleEditUserMessageWithScroll}
            onCancelUserMessageEdit={handleCancelUserMessageEdit}
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
