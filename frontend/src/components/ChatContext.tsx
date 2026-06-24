import { useXChat } from '@ant-design/x-sdk';
import React from 'react';
import type { AppChatMessage } from '../hooks/useConversationChat';

export type ChatContextValue = {
  onReload?: ReturnType<typeof useXChat>['onReload'];
  setMessage?: ReturnType<typeof useXChat<AppChatMessage>>['setMessage'];
  sessionId?: string;
  onFeedback?: (messageId: string, feedbackType: 'good' | 'bad') => void;
};

export const ChatContext = React.createContext<ChatContextValue>({});
