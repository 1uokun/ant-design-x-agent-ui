import { GlobalOutlined, SyncOutlined } from '@ant-design/icons';
import type { BubbleListProps, ThoughtChainItemProps } from '@ant-design/x';
import { Actions, Think, ThoughtChain } from '@ant-design/x';
import type { ComponentProps } from '@ant-design/x-markdown';
import XMarkdown from '@ant-design/x-markdown';
import { message, Pagination } from 'antd';
import React from 'react';
import locale from '../_utils/local';
import type { AppChatMessage } from '../hooks/useConversationChat';
import { ChatContext } from './ChatContext';

const THOUGHT_CHAIN_CONFIG = {
  loading: {
    title: locale.modelIsRunning,
    status: 'loading',
  },
  updating: {
    title: locale.modelIsRunning,
    status: 'loading',
  },
  success: {
    title: locale.modelExecutionCompleted,
    status: 'success',
  },
  error: {
    title: locale.executionFailed,
    status: 'error',
  },
  abort: {
    title: locale.aborted,
    status: 'abort',
  },
};

const ThinkComponent = React.memo((props: ComponentProps) => {
  const [title, setTitle] = React.useState(`${locale.deepThinking}...`);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (props.streamStatus === 'done') {
      setTitle(locale.completeThinking);
      setLoading(false);
    }
  }, [props.streamStatus]);

  return (
    <Think title={title} loading={loading}>
      {props.children}
    </Think>
  );
});

const Footer: React.FC<{
  id?: string | number;
  content: string;
  status?: string;
  extraInfo?: AppChatMessage['extraInfo'];
}> = ({ id, content, extraInfo, status }) => {
  const context = React.useContext(ChatContext);
  const Items = [
    {
      key: 'pagination',
      actionRender: <Pagination simple total={1} pageSize={1} />,
    },
    {
      key: 'retry',
      label: locale.retry,
      icon: <SyncOutlined />,
      onItemClick: () => {
        if (id) {
          context?.onReload?.(id, {
            userAction: 'retry',
          });
        }
      },
    },
    {
      key: 'copy',
      actionRender: <Actions.Copy text={content} />,
    },
    {
      key: 'audio',
      actionRender: (
        <Actions.Audio
          onClick={() => {
            message.info(locale.isMock);
          }}
        />
      ),
    },
    {
      key: 'feedback',
      actionRender: (
        <Actions.Feedback
          styles={{
            liked: {
              color: '#f759ab',
            },
          }}
          value={extraInfo?.feedback || 'default'}
          key="feedback"
          onChange={(val) => {
            if (id && val !== 'default') {
              const messageId = String(id).replace(/-request$/, '');
              context?.setMessage?.(id, () => ({
                extraInfo: { feedback: val },
              }));
              if (val === 'like' || val === 'dislike') {
                context?.onFeedback?.(messageId, val === 'like' ? 'good' : 'bad');
              }
            }
          }}
        />
      ),
    },
  ];
  return status !== 'updating' && status !== 'loading' ? (
    <div style={{ display: 'flex' }}>{id && <Actions items={Items} />}</div>
  ) : null;
};

export const getAssistantRole = (className: string): NonNullable<BubbleListProps['role']>['assistant'] => ({
  placement: 'start',
  header: (_, { status }) => {
    const config = THOUGHT_CHAIN_CONFIG[status as keyof typeof THOUGHT_CHAIN_CONFIG];
    return config ? (
      <ThoughtChain.Item
        style={{
          marginBottom: 8,
        }}
        status={config.status as ThoughtChainItemProps['status']}
        variant="solid"
        icon={<GlobalOutlined />}
        title={config.title}
      />
    ) : null;
  },
  footer: (content, { status, key, extraInfo }) => (
    <Footer
      content={content}
      status={status}
      extraInfo={extraInfo as AppChatMessage['extraInfo']}
      id={key as string}
    />
  ),
  contentRender: (content: string, { status }) => {
    const newContent = content.replace(/\n\n/g, '<br/><br/>');
    return (
      <XMarkdown
        paragraphTag="div"
        components={{
          think: ThinkComponent,
        }}
        className={className}
        streaming={{
          hasNextChunk: status === 'updating',
          enableAnimation: true,
        }}
      >
        {newContent}
      </XMarkdown>
    );
  },
});
