import type { ActionsFeedbackProps } from "@ant-design/x";
import { useXChat, useXConversations, type DefaultMessageInfo } from "@ant-design/x-sdk";
import type { MessageInstance } from "antd/es/message/interface";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  abortChat,
  buildChatRequestParams,
  createChatRoundMeta,
  deleteSession,
  fetchMessageList,
  fetchSessionList,
  submitFeedback,
  updateSession,
  type Conversation,
} from "../api/message";
import locale from "../_utils/local";
import { createDeepSeekChatProvider } from "../chat/DeepSeekChatProvider";
import { DEFAULT_MODEL, DEFAULT_USER_ID } from "../chat/constants";
import { turnsToChatMessageInfos } from "../chat/history";
import {
  buildLocalConversation,
  getConversationGroupByTime,
  getConversationGroupSortKey,
  mergeServerAndLocalConversations,
  sessionToConversation,
} from "../chat/session";
import { generateSessionId } from "../utils/id";

export type AppChatMessage = {
  role: string;
  content: string | { text?: string; imageUrls?: string[] };
  messageId?: string;
  requestId?: string;
  responseId?: string;
  modelName?: string;
  requestTime?: string;
  responseTime?: string;
  feedbackType?: string;
  extraInfo?: {
    feedback?: ActionsFeedbackProps["value"];
  };
};

type UseConversationChatOptions = {
  messageApi: MessageInstance;
};

export function useConversationChat({ messageApi }: UseConversationChatOptions) {
  const {
    conversations,
    activeConversationKey,
    setActiveConversationKey,
    setConversations,
    addConversation,
    removeConversation,
    setConversation,
  } = useXConversations({ defaultConversations: [] });

  const [draftChatKey, setDraftChatKey] = useState(() => generateSessionId());
  const localConversationsRef = useRef<Conversation[]>([]);
  const conversationsRef = useRef(conversations);
  const activeConversationKeyRef = useRef(activeConversationKey);
  const prevActiveConversationKeyRef = useRef(activeConversationKey);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    activeConversationKeyRef.current = activeConversationKey;
  }, [activeConversationKey]);

  useEffect(() => {
    const prevKey = prevActiveConversationKeyRef.current;
    if (prevKey && !activeConversationKey) {
      setDraftChatKey(generateSessionId());
    }
    prevActiveConversationKeyRef.current = activeConversationKey;
  }, [activeConversationKey]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const sessions = await fetchSessionList(DEFAULT_USER_ID);
        if (cancelled) return;
        const list = sessions.map(sessionToConversation);
        const serverKeys = new Set(list.map((item) => item.key));
        localConversationsRef.current = localConversationsRef.current.filter(
          (item) => !serverKeys.has(item.key),
        );
        setConversations(
          mergeServerAndLocalConversations(list, localConversationsRef.current),
        );
      } catch {
        if (!cancelled) messageApi.error("加载会话列表失败");
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [messageApi, setConversations]);

  const upsertLocalConversation = useCallback(
    (conversation: Conversation) => {
      localConversationsRef.current = [
        conversation,
        ...localConversationsRef.current.filter((item) => item.key !== conversation.key),
      ];
      addConversation(conversation, "prepend");
    },
    [addConversation],
  );

  const touchConversation = useCallback(
    (key: string, patch: Partial<Conversation> = {}) => {
      const current = conversationsRef.current.find((item) => item.key === key);
      if (!current) return;
      const lastMessageTime = patch.lastMessageTime ?? new Date().toISOString();
      setConversation(key, {
        ...current,
        label: current.label || "",
        ...patch,
        lastMessageTime,
        group: current.pinned ? "置顶" : getConversationGroupByTime(lastMessageTime),
      });
    },
    [setConversation],
  );

  const chatConversationKey = activeConversationKey || draftChatKey;

  const {
    messages,
    isRequesting,
    isDefaultMessagesRequesting,
    abort,
    onRequest,
    queueRequest,
    onReload,
    setMessage,
  } = useXChat<AppChatMessage>({
    provider: createDeepSeekChatProvider(chatConversationKey, {
      modelName: DEFAULT_MODEL,
      userId: DEFAULT_USER_ID,
    }) as never,
    conversationKey: chatConversationKey,
    defaultMessages: async (info?: { conversationKey?: string }) => {
      const conversationKey = info?.conversationKey;
      if (!conversationKey || !activeConversationKeyRef.current) return [];
      if (localConversationsRef.current.some((item) => item.key === conversationKey)) {
        return [];
      }
      try {
        const turns = await fetchMessageList(conversationKey);
        return turnsToChatMessageInfos(turns) as DefaultMessageInfo<AppChatMessage>[];
      } catch {
        messageApi.error("加载历史消息失败");
        return [];
      }
    },
    requestPlaceholder: () => ({ content: "", role: "assistant" }),
    requestFallback: (_, { error, errorInfo, messageInfo }) => {
      if (error.name === "AbortError") {
        return {
          content: messageInfo?.message?.content || locale.requestAborted,
          role: "assistant",
        };
      }
      return {
        content: errorInfo?.error?.message || locale.requestFailed,
        role: "assistant",
      };
    },
  });

  const handleFeedback = useCallback(
    async (messageId: string, feedbackType: "good" | "bad") => {
      if (!activeConversationKey) return;
      try {
        await submitFeedback({ sessionId: activeConversationKey, messageId, feedbackType });
      } catch {
        messageApi.error("提交反馈失败");
      }
    },
    [activeConversationKey, messageApi],
  );

  const handleAbort = useCallback(async () => {
    const streaming = [...messages]
      .reverse()
      .find((item) => item.status === "loading" || item.status === "updating");
    const messageId = streaming?.message?.messageId;
    if (activeConversationKey && messageId) {
      try {
        await abortChat({ sessionId: activeConversationKey, messageId });
      } catch {
        messageApi.error("停止生成失败");
      }
    }
    abort();
  }, [messages, activeConversationKey, abort, messageApi]);

  const onSubmit = useCallback(
    (val: string) => {
      if (!val.trim()) return;
      const roundMeta = createChatRoundMeta(DEFAULT_MODEL);
      const requestParams = buildChatRequestParams(val, roundMeta);

      if (!activeConversationKey) {
        const sessionId = generateSessionId();
        upsertLocalConversation(buildLocalConversation(sessionId, val));
        queueRequest(sessionId, requestParams as Parameters<typeof onRequest>[0]);
        setActiveConversationKey(sessionId);
        return;
      }

      onRequest(requestParams as Parameters<typeof onRequest>[0]);
      const current = conversationsRef.current.find((item) => item.key === activeConversationKey);
      touchConversation(activeConversationKey, {
        label: current?.label || val.slice(0, 15),
      });
    },
    [
      activeConversationKey,
      onRequest,
      queueRequest,
      setActiveConversationKey,
      touchConversation,
      upsertLocalConversation,
    ],
  );

  const handleCreateConversation = useCallback(() => {
    if (!activeConversationKey) {
      messageApi.error(locale.itIsNowANewConversation);
      return;
    }
    setActiveConversationKey("");
  }, [activeConversationKey, messageApi, setActiveConversationKey]);

  const handleDeleteConversation = useCallback(
    (key: string) => {
      return (async () => {
        try {
          await deleteSession(key);
          localConversationsRef.current = localConversationsRef.current.filter(
            (item) => item.key !== key,
          );
          removeConversation(key);
          if (key === activeConversationKey) {
            const remaining = conversationsRef.current.filter((item) => item.key !== key);
            setActiveConversationKey(remaining[0]?.key || "");
          }
        } catch {
          messageApi.error("删除会话失败");
          throw new Error("delete failed");
        }
      })();
    },
    [activeConversationKey, messageApi, removeConversation, setActiveConversationKey],
  );

  const handleRenameConversation = useCallback(
    async (key: string, title: string) => {
      const nextTitle = title.trim().slice(0, 15);
      if (!nextTitle) {
        messageApi.error("请输入会话名称");
        return false;
      }
      try {
        await updateSession(key, { title: nextTitle });
        const current = conversationsRef.current.find((item) => item.key === key);
        if (current) {
          setConversation(key, { ...current, label: nextTitle });
        }
        return true;
      } catch {
        messageApi.error("重命名失败");
        return false;
      }
    },
    [messageApi, setConversation],
  );

  const sortedConversations = useMemo(() => {
    const next = [...conversations] as Conversation[];
    next.sort((a, b) => {
      const aGroupKey = getConversationGroupSortKey(a.group || "");
      const bGroupKey = getConversationGroupSortKey(b.group || "");
      if (aGroupKey !== bGroupKey) return aGroupKey - bGroupKey;
      const aTime = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
      const bTime = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
      return bTime - aTime;
    });
    return next;
  }, [conversations]);

  return {
    conversations: sortedConversations,
    activeConversationKey,
    setActiveConversationKey,
    messages,
    isRequesting,
    isDefaultMessagesRequesting,
    onRequest,
    onReload,
    setMessage,
    onSubmit,
    handleAbort,
    handleFeedback,
    handleCreateConversation,
    handleDeleteConversation,
    handleRenameConversation,
  };
}
