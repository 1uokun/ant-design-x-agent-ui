import { useXChat } from '@ant-design/x-sdk';
import React from 'react';
import type { AppChatMessage } from '../hooks/useConversationChat';

export type ChatContextValue = {
  onReload?: ReturnType<typeof useXChat>['onReload'];
  setMessage?: ReturnType<typeof useXChat<AppChatMessage>>['setMessage'];
  sessionId?: string;
  loadMoreHistory?: () => void;
  onFeedback?: (messageId: string, feedbackType: 'good' | 'bad') => void;
  onDeleteMessage?: (bubbleId: string | number) => Promise<void>;
  onToggleUserMessageEdit?: (messageKey: string | number, editing: boolean) => void;
  onEditUserMessage?: (messageKey: string | number, content: string) => void;
  onCancelUserMessageEdit?: (messageKey: string | number) => void;
};

export const ChatContext = React.createContext<ChatContextValue>({});
