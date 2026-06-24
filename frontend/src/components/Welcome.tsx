import {
  CommentOutlined,
  EllipsisOutlined,
  HeartOutlined,
  PaperClipOutlined,
  ShareAltOutlined,
  SmileOutlined,
} from '@ant-design/icons';
import { Prompts, Welcome as AntWelcome } from '@ant-design/x';
import { Button, Flex, Space } from 'antd';
import { createStyles } from 'antd-style';
import React from 'react';
import locale from '../_utils/local';

const useStyle = createStyles(({ token, css }) => ({
  placeholder: css`
    width: 100%;
    padding: ${token.paddingLG}px;
    box-sizing: border-box;
  `,
  chatPrompt: css`
    .ant-prompts-label {
      color: #000000e0 !important;
    }
    .ant-prompts-desc {
      color: #000000a6 !important;
      width: 100%;
    }
    .ant-prompts-icon {
      color: #000000a6 !important;
    }
  `,
}));

const HOT_TOPICS = {
  key: '1',
  label: locale.hotTopics,
  children: [
    {
      key: '1-1',
      description: locale.whatComponentsAreInAntDesignX,
      icon: <span style={{ color: '#f93a4a', fontWeight: 700 }}>1</span>,
    },
    {
      key: '1-2',
      description: locale.newAgiHybridInterface,
      icon: <span style={{ color: '#ff6565', fontWeight: 700 }}>2</span>,
    },
    {
      key: '1-3',
      description: locale.whatComponentsAreInAntDesignX,
      icon: <span style={{ color: '#ff8f1f', fontWeight: 700 }}>3</span>,
    },
    {
      key: '1-4',
      description: locale.comeAndDiscoverNewDesignParadigm,
      icon: <span style={{ color: '#00000040', fontWeight: 700 }}>4</span>,
    },
    {
      key: '1-5',
      description: locale.howToQuicklyInstallAndImportComponents,
      icon: <span style={{ color: '#00000040', fontWeight: 700 }}>5</span>,
    },
  ],
};

const DESIGN_GUIDE = {
  key: '2',
  label: locale.designGuide,
  children: [
    {
      key: '2-1',
      icon: <HeartOutlined />,
      label: locale.intention,
      description: locale.aiUnderstandsUserNeedsAndProvidesSolutions,
    },
    {
      key: '2-2',
      icon: <SmileOutlined />,
      label: locale.role,
      description: locale.aiPublicPersonAndImage,
    },
    {
      key: '2-3',
      icon: <CommentOutlined />,
      label: locale.chat,
      description: locale.howAICanExpressItselfWayUsersUnderstand,
    },
    {
      key: '2-4',
      icon: <PaperClipOutlined />,
      label: locale.interface,
      description: locale.aiBalances,
    },
  ],
};

export type ChatWelcomeProps = {
  onSubmit: (val: string) => void;
};

const ChatWelcome: React.FC<ChatWelcomeProps> = ({ onSubmit }) => {
  const { styles } = useStyle();

  return (
    <Flex
      vertical
      style={{ maxWidth: 840 }}
      gap={16}
      align="center"
      className={styles.placeholder}
    >
      <AntWelcome
        style={{ width: '100%' }}
        variant="borderless"
        icon="https://mdn.alipayobjects.com/huamei_iwk9zp/afts/img/A*s5sNRo5LjfQAAAAAAAAAAAAADgCCAQ/fmt.webp"
        title={locale.welcome}
        description={locale.welcomeDescription}
        extra={
          <Space>
            <Button icon={<ShareAltOutlined />} />
            <Button icon={<EllipsisOutlined />} />
          </Space>
        }
      />
      <Flex gap={16} justify="center" style={{ width: '100%' }}>
        <Prompts
          items={[HOT_TOPICS]}
          styles={{
            list: { height: '100%' },
            item: {
              flex: 1,
              backgroundImage: 'linear-gradient(123deg, #e5f4ff 0%, #efe7ff 100%)',
              borderRadius: 12,
              border: 'none',
            },
            subItem: { padding: 0, background: 'transparent' },
          }}
          onItemClick={(info) => {
            onSubmit(info.data.description as string);
          }}
          className={styles.chatPrompt}
        />
        <Prompts
          items={[DESIGN_GUIDE]}
          styles={{
            item: {
              flex: 1,
              backgroundImage: 'linear-gradient(123deg, #e5f4ff 0%, #efe7ff 100%)',
              borderRadius: 12,
              border: 'none',
            },
            subItem: { background: '#ffffffa6' },
          }}
          onItemClick={(info) => {
            onSubmit(info.data.description as string);
          }}
          className={styles.chatPrompt}
        />
      </Flex>
    </Flex>
  );
};

export default ChatWelcome;
