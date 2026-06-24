# useConversationChat

在 `useXConversations` + `useXChat` 之上对接后端 API，`App.tsx` 的唯一入口。

## 功能概览

| 模块 | 做什么 | 涉及 |
|------|--------|------|
| URL 同步 | `/chat/:sessionId` ↔ 当前会话，支持前进后退 | `utils/route` |
| 会话列表 + 后端 | 拉取/删/改名会话，首条消息前本地草稿合并 | `useXConversations`、`adapters` |
| 消息聊天 | 流式对话、切换会话拉历史、失败/中止兜底 | `useXChat`、`provider` |
| 发送 / 中断 / 反馈 | 发送、停止生成、点赞点踩 | `abortChat`、`submitFeedback` |
| 排序整理 | 置顶 / 今天 / 昨天 / 日期分组排序 | `adapters` |

## 入参

| 参数 | 类型 | 说明 |
|------|------|------|
| `messageApi` | `MessageInstance` | antd `message.useMessage()` 返回值，用于错误提示 |

## 返回值

| 字段 | 类型 | 说明 | 传给 |
|------|------|------|------|
| `conversations` | `Conversation[]` | 分组排序后的会话列表 | `ConversationSide` |
| `activeConversationKey` | `string` | 当前选中会话 ID，空字符串表示新对话 | 侧边栏 / `ChatSender` / `ChatContext` |
| `selectConversation` | `(key: string) => void` | 切换会话 | `ConversationSide` |
| `messages` | `DefaultMessageInfo<AppChatMessage>[]` | 当前会话消息 | `ChatList` → `Bubble.List` |
| `isRequesting` | `boolean` | 是否正在流式生成 | `ChatSender` loading |
| `isDefaultMessagesRequesting` | `boolean` | 是否正在加载历史消息 | `ChatList` |
| `onSubmit` | `(val: string) => void` | 发送用户消息 | `ChatSender` / `ChatWelcome` |
| `handleAbort` | `() => void` | 停止生成 | `ChatSender` onCancel |
| `onReload` | `useXChat` 同名 | 重试某条消息 | `ChatContext` → `BubbleAssistant` |
| `setMessage` | `useXChat` 同名 | 更新单条消息（如反馈状态） | `ChatContext` → `BubbleAssistant` |
| `handleFeedback` | `(messageId, 'good' \| 'bad') => void` | 提交点赞/点踩 | `ChatContext` |
| `handleCreateConversation` | `() => void` | 新建会话（清空当前选中） | `ConversationSide` |
| `handleDeleteConversation` | `(key: string) => Promise<void>` | 删除会话 | `ConversationSide` |
| `handleRenameConversation` | `(key, title) => Promise<boolean>` | 重命名会话 | `ConversationSide` |
| `onRequest` | `useXChat` 同名 | 底层发请求，一般不用，优先 `onSubmit` | — |

另导出类型 `AppChatMessage`，供 `ChatList`、`BubbleAssistant`、`ChatContext` 使用。

## 使用示例

```tsx
import { message } from "antd";
import { useConversationChat } from "./hooks/useConversationChat";

const App = () => {
  const [messageApi, contextHolder] = message.useMessage();

  const {
    conversations,
    activeConversationKey,
    selectConversation,
    messages,
    isRequesting,
    isDefaultMessagesRequesting,
    onReload,
    setMessage,
    onSubmit,
    handleAbort,
    handleFeedback,
    handleCreateConversation,
    handleDeleteConversation,
    handleRenameConversation,
  } = useConversationChat({ messageApi });

  return (
    <>
      {contextHolder}
      <ChatContext.Provider
        value={{ onReload, setMessage, sessionId: activeConversationKey, onFeedback: handleFeedback }}
      >
        <ConversationSide
          conversations={conversations}
          activeConversationKey={activeConversationKey}
          onSelect={selectConversation}
          onCreate={handleCreateConversation}
          onDelete={handleDeleteConversation}
          onRename={handleRenameConversation}
        />
        <ChatList messages={messages} isDefaultMessagesRequesting={isDefaultMessagesRequesting} onSubmit={onSubmit} />
        <ChatSender activeConversationKey={activeConversationKey} isRequesting={isRequesting} onSubmit={onSubmit} onCancel={handleAbort} />
      </ChatContext.Provider>
    </>
  );
};
```
