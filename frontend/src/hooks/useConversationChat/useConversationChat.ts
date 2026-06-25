import { useXChat, useXConversations } from "@ant-design/x-sdk";
import type { MessageInstance } from "antd/es/message/interface";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  abortChat,
  buildChatRequestParams,
  createChatRoundMeta,
  deleteMessage,
  deleteSession,
  fetchAvailableModelIds,
  fetchSessionList,
  fetchStreamBuffer,
  submitFeedback,
  updateSession,
  type Conversation,
} from "../../api/message";
import locale from "../../_utils/local";
import {
  getChatModelKey,
  mergeChatModels,
  readStoredModelName,
  resolveChatModelName,
  resolveModelKey,
  writeStoredModelName,
  type ChatModelOption,
} from "../../config/chat-models";
import { generateSessionId } from "../../utils/id";
import {
  getSessionIdFromPath,
  syncChatPath,
} from "../../utils/route";
import { DEFAULT_MODEL, DEFAULT_USER_ID } from "./types";
import {
  buildLocalConversation,
  getConversationGroupByTime,
  getConversationGroupSortKey,
  mergeServerAndLocalConversations,
  sessionToConversation,
  assistantStatusFromStreamBuffer,
} from "./adapters";
import { createDeepSeekChatProvider, type ChatProviderInput } from "./provider";
import { subscribeStreamBuffer } from "./subscribeStreamBuffer";
import { appendHistoryPage, fetchFirstHistoryPage } from "./historyPagination";
import { syncChatModelName } from "./model-sync";
import type { AppChatMessage } from "./types";

type UseConversationChatOptions = {
  messageApi: MessageInstance;
};

export function useConversationChat({ messageApi }: UseConversationChatOptions) {
  const routeSessionIdRef = useRef(getSessionIdFromPath());
  const skipUrlSyncRef = useRef(false);
  const [routeReady, setRouteReady] = useState(false);
  const [chatModels, setChatModels] = useState<ChatModelOption[]>([]);
  const [modelKey, setModelKeyState] = useState(() => {
    const stored = readStoredModelName();
    return stored ? resolveModelKey(stored) : "";
  });

  const modelName = useMemo(
    () => resolveChatModelName(modelKey, chatModels) || readStoredModelName() || DEFAULT_MODEL,
    [modelKey, chatModels],
  );

  useEffect(() => {
    const stored = readStoredModelName();
    if (stored) syncChatModelName.write(stored);
  }, []);

  const setModelKey = useCallback(
    (key: string) => {
      const name = resolveChatModelName(key, chatModels);
      setModelKeyState(key);
      if (name) {
        writeStoredModelName(name);
        syncChatModelName.write(name);
      }
    },
    [chatModels],
  );

  useEffect(() => {
    let cancelled = false;

    fetchAvailableModelIds()
      .then((ids) => {
        if (cancelled || ids.length === 0) return;

        const merged = mergeChatModels(ids);
        setChatModels(merged);

        const stored = readStoredModelName();
        const matched = stored ? merged.find((item) => item.modelName === stored) : undefined;
        const selected = matched ?? merged[0];
        const key = getChatModelKey(selected);

        setModelKeyState(key);
        writeStoredModelName(selected.modelName);
        syncChatModelName.write(selected.modelName);
      })
      .catch(() => {
        // 上游不可用时沿用 localStorage 中的 modelName
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
      routeSessionIdRef.current = null;
    }
    prevActiveConversationKeyRef.current = activeConversationKey;
  }, [activeConversationKey]);

  useLayoutEffect(() => {
    const sessionIdFromPath = getSessionIdFromPath();
    if (sessionIdFromPath) {
      routeSessionIdRef.current = sessionIdFromPath;
      setActiveConversationKey(sessionIdFromPath);
    }
    setRouteReady(true);
  }, [setActiveConversationKey]);

  useEffect(() => {
    if (!routeReady) return;
    if (skipUrlSyncRef.current) {
      skipUrlSyncRef.current = false;
      return;
    }
    syncChatPath(activeConversationKey || null);
  }, [activeConversationKey, routeReady]);

  useEffect(() => {
    const onPopState = () => {
      skipUrlSyncRef.current = true;
      const sessionId = getSessionIdFromPath();
      routeSessionIdRef.current = sessionId;
      setActiveConversationKey(sessionId || "");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [setActiveConversationKey]);

  const selectConversation = useCallback(
    (key: string) => {
      routeSessionIdRef.current = null;
      setActiveConversationKey(key);
    },
    [setActiveConversationKey],
  );

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
        if (!cancelled) messageApi.error(locale.loadSessionListFailed);
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
        group: current.pinned ? locale.pinned : getConversationGroupByTime(lastMessageTime),
      });
    },
    [setConversation],
  );

  const chatConversationKey =
    activeConversationKey || routeSessionIdRef.current || draftChatKey;

  const isLocalSession = (sessionId: string) =>
    localConversationsRef.current.some((item) => item.key === sessionId);

  useEffect(() => {
    createDeepSeekChatProvider(chatConversationKey, {
      modelName,
      userId: DEFAULT_USER_ID,
    });
    syncChatModelName.write(modelName);
  }, [chatConversationKey, modelName]);

  const {
    messages,
    isRequesting,
    isDefaultMessagesRequesting,
    abort,
    onRequest,
    queueRequest,
    onReload: reloadMessage,
    setMessage,
    setMessages,
    removeMessage,
  } = useXChat<AppChatMessage>({
    provider: createDeepSeekChatProvider(chatConversationKey, {
      modelName,
      userId: DEFAULT_USER_ID,
    }) as never,
    conversationKey: chatConversationKey,
    defaultMessages: async (info?: { conversationKey?: string }) => {
      const conversationKey = info?.conversationKey;
      if (!conversationKey) return [];

      const targetKey = activeConversationKeyRef.current || routeSessionIdRef.current;
      if (!targetKey || conversationKey !== targetKey) {
        return [];
      }
      if (localConversationsRef.current.some((item) => item.key === conversationKey)) {
        return [];
      }
      try {
        return await fetchFirstHistoryPage(conversationKey);
      } catch {
        messageApi.error(locale.loadHistoryFailed);
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

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const loadMoreHistory = useCallback(() => {
    if (!chatConversationKey || isLocalSession(chatConversationKey)) return;
    appendHistoryPage(chatConversationKey, setMessages, () =>
      messageApi.error(locale.loadMoreHistoryFailed),
    );
  }, [chatConversationKey, messageApi, setMessages]);

  const serverStreamingMessageId = useMemo(() => {
    if (isRequesting) return null;
    const streaming = [...messages]
      .reverse()
      .find(
        (item) =>
          item.message.role === "assistant" &&
          (item.status === "loading" || item.status === "updating"),
      );
    return streaming?.message?.messageId ?? null;
  }, [isRequesting, messages]);

  useEffect(() => {
    if (!activeConversationKey || !serverStreamingMessageId || isDefaultMessagesRequesting) return;

    const messageId = serverStreamingMessageId;
    const streamingMsg = messagesRef.current.find((item) => item.id === messageId);
    const initialText =
      typeof streamingMsg?.message.content === "string"
        ? streamingMsg.message.content
        : (streamingMsg?.message.content?.text ?? "");

    const ac = new AbortController();

    const applyFinalBuffer = async () => {
      try {
        const buffer = await fetchStreamBuffer(activeConversationKey, messageId);
        const status = assistantStatusFromStreamBuffer(buffer.eventType, buffer.text);
        setMessage(messageId, (msg) => ({
          status,
          message: {
            ...msg.message,
            content: buffer.text,
            feedbackType: buffer.feedbackType ?? undefined,
          },
        }));
      } catch {
        setMessage(messageId, (msg) => ({ ...msg, status: "success" }));
      }
    };

    subscribeStreamBuffer(
      activeConversationKey,
      messageId,
      initialText,
      {
        onUpdate: (text) => {
          setMessage(messageId, (msg) => ({
            status: text ? "updating" : "loading",
            message: { ...msg.message, content: text },
          }));
        },
        onDone: () => {
          void applyFinalBuffer();
        },
        onError: () => {
          void applyFinalBuffer();
        },
      },
      ac.signal,
    ).catch(() => {
      if (!ac.signal.aborted) void applyFinalBuffer();
    });

    return () => {
      ac.abort();
    };
  }, [activeConversationKey, serverStreamingMessageId, isDefaultMessagesRequesting, setMessage]);

  const handleReload = useCallback(
    (
      id: string | number,
      requestParams?: Partial<ChatProviderInput>,
      opts?: Parameters<typeof reloadMessage>[2],
    ) => {
      const msgInfo = messages.find((item) => item.id === id);
      if (!msgInfo) {
        messageApi.error(locale.messageNotFound);
        return;
      }
      const { messageId, requestId, responseId, modelName: msgModelName } = msgInfo.message;
      if (!messageId || !requestId || !responseId) {
        messageApi.error(locale.regenerateMissingId);
        return;
      }
      reloadMessage(
        id,
        {
          ...requestParams,
          userAction: "retry",
          messageId,
          requestId,
          responseId,
          modelName: requestParams?.modelName ?? msgModelName ?? modelName,
        },
        opts,
      );
    },
    [messages, modelName, messageApi, reloadMessage],
  );

  const handleFeedback = useCallback(
    async (messageId: string, feedbackType: "good" | "bad") => {
      if (!activeConversationKey) return;
      try {
        await submitFeedback({ sessionId: activeConversationKey, messageId, feedbackType });
      } catch {
        messageApi.error(locale.submitFeedbackFailed);
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
        messageApi.error(locale.stopGenerationFailed);
      }
    }
    abort();
  }, [messages, activeConversationKey, abort, messageApi]);

  const onSubmit = useCallback(
    (val: string) => {
      if (!val.trim()) return;
      const roundMeta = createChatRoundMeta(modelName);
      const requestParams = {
        ...buildChatRequestParams(val, roundMeta),
        modelName,
      };

      if (!activeConversationKey) {
        const sessionId = generateSessionId();
        upsertLocalConversation(buildLocalConversation(sessionId, val));
        queueRequest(sessionId, requestParams as Parameters<typeof onRequest>[0]);
        setActiveConversationKey(sessionId);
        return;
      }

      onRequest(requestParams as Parameters<typeof onRequest>[0]);
      touchConversation(activeConversationKey);
    },
    [
      activeConversationKey,
      modelName,
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
    routeSessionIdRef.current = null;
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
          messageApi.error(locale.deleteSessionFailed);
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
        messageApi.error(locale.enterSessionName);
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
        messageApi.error(locale.renameFailed);
        return false;
      }
    },
    [messageApi, setConversation],
  );

  const handleTogglePin = useCallback(
    async (key: string, pinned: boolean) => {
      try {
        await updateSession(key, { pinned });
        const current = conversationsRef.current.find((item) => item.key === key);
        if (current) {
          setConversation(key, {
            ...current,
            pinned,
            group: pinned
              ? locale.pinned
              : getConversationGroupByTime(current.lastMessageTime),
          });
        }
      } catch {
        messageApi.error(locale.pinFailed);
      }
    },
    [messageApi, setConversation],
  );

  const handleDeleteMessage = useCallback(
    async (bubbleId: string | number) => {
      const id = String(bubbleId);
      const messageId = id.replace(/-request$/, "");
      if (!messageId) return;
      try {
        await deleteMessage(messageId);
        removeMessage(`${messageId}-request`);
        removeMessage(messageId);
      } catch {
        messageApi.error(locale.deleteMessageFailed);
        throw new Error("delete message failed");
      }
    },
    [messageApi, removeMessage],
  );

  const handleToggleUserMessageEdit = useCallback(
    (messageKey: string | number, editing: boolean) => {
      setMessage(messageKey, (msg) => ({
        extraInfo: { ...msg.extraInfo, editing },
      }));
    },
    [setMessage],
  );

  const handleCancelUserMessageEdit = useCallback(
    (messageKey: string | number) => {
      setMessage(messageKey, (msg) => ({
        extraInfo: { ...msg.extraInfo, editing: false },
      }));
    },
    [setMessage],
  );

  const handleEditUserMessage = useCallback(
    (messageKey: string | number, content: string) => {
      const target = messages.find((item) => item.id === messageKey);
      if (!target) return;

      const { messageId, requestId, responseId, modelName: msgModelName } = target.message;
      if (!messageId || !requestId || !responseId) return;

      setMessage(messageKey, (msg) => ({
        message: { ...msg.message, content },
        extraInfo: { ...msg.extraInfo, editing: false },
      }));

      const assistantMessage = messages.find(
        (item) => item.id === messageId && item.message.role === "assistant",
      );

      if (assistantMessage) {
        reloadMessage(messageId, {
          userAction: "retry",
          messageId,
          requestId,
          responseId,
          modelName: msgModelName ?? modelName,
        });
      }
    },
    [messages, modelName, setMessage, reloadMessage],
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
    selectConversation,
    messages,
    isRequesting,
    isDefaultMessagesRequesting,
    loadMoreHistory,
    modelKey,
    modelName,
    chatModels,
    setModelKey,
    onRequest,
    onReload: handleReload,
    setMessage,
    onSubmit,
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
  };
}
