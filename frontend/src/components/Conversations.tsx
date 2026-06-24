import { DeleteOutlined, EditOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { Conversations as AntConversations } from '@ant-design/x';
import { Avatar, Button, Input, Modal } from 'antd';
import { createStyles } from 'antd-style';
import React, { useState } from 'react';
import locale from '../_utils/local';
import type { Conversation } from '../api/message';

const useStyle = createStyles(({ token, css }) => ({
  side: css`
    background: ${token.colorBgLayout}80;
    width: 280px;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 0 12px;
    box-sizing: border-box;
  `,
  logo: css`
    display: flex;
    align-items: center;
    justify-content: start;
    padding: 0 24px;
    box-sizing: border-box;
    gap: 8px;
    margin: 24px 0;

    span {
      font-weight: bold;
      color: ${token.colorText};
      font-size: 16px;
    }
  `,
  conversations: css`
    overflow-y: auto;
    margin-top: 12px;
    padding: 0;
    flex: 1;
    .ant-conversations-list {
      padding-inline-start: 0;
    }
  `,
  sideFooter: css`
    border-top: 1px solid ${token.colorBorderSecondary};
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  `,
}));

export type ConversationSideProps = {
  conversations: Conversation[];
  activeConversationKey?: string;
  onSelect: (key: string) => void;
  onCreate: () => void;
  onDelete: (key: string) => void;
  onRename: (key: string, name: string) => Promise<boolean>;
};

const ConversationSide: React.FC<ConversationSideProps> = ({
  conversations,
  activeConversationKey,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}) => {
  const { styles } = useStyle();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameKey, setRenameKey] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);

  const handleOpenRename = (key: string, title?: string) => {
    setRenameKey(key);
    setRenameValue(String(title || '').replace(`[${locale.curConversation}]`, ''));
    setRenameOpen(true);
  };

  const handleConfirmRename = async () => {
    setRenameLoading(true);
    try {
      const ok = await onRename(renameKey, renameValue);
      if (ok) setRenameOpen(false);
    } finally {
      setRenameLoading(false);
    }
  };

  const confirmDeleteConversation = (key: string) => {
    Modal.confirm({
      title: locale.delete,
      okText: '确定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => onDelete(key),
    });
  };

  return (
    <>
      <div className={styles.side}>
        <div className={styles.logo}>
          <img
            src="https://mdn.alipayobjects.com/huamei_iwk9zp/afts/img/A*eco6RrQhxbMAAAAAAAAAAAAADgCCAQ/original"
            draggable={false}
            alt="logo"
            width={24}
            height={24}
          />
          <span>Ant Design X</span>
        </div>
        <AntConversations
          creation={{
            onClick: onCreate,
          }}
          items={conversations.map(({ key, label, ...other }) => ({
            key,
            label: key === activeConversationKey ? `[${locale.curConversation}]${label}` : label,
            ...other,
          }))}
          className={styles.conversations}
          activeKey={activeConversationKey}
          onActiveChange={onSelect}
          groupable
          styles={{ item: { padding: '0 8px' } }}
          menu={(conversation) => ({
            items: [
              {
                label: locale.rename,
                key: 'rename',
                icon: <EditOutlined />,
                onClick: () => handleOpenRename(conversation.key, String(conversation.label ?? '')),
              },
              {
                label: locale.delete,
                key: 'delete',
                icon: <DeleteOutlined />,
                danger: true,
                onClick: () => confirmDeleteConversation(conversation.key),
              },
            ],
          })}
        />
        <div className={styles.sideFooter}>
          <Avatar size={24} />
          <Button type="text" icon={<QuestionCircleOutlined />} />
        </div>
      </div>
      <Modal
        title={locale.rename}
        open={renameOpen}
        okText="确定"
        cancelText="取消"
        confirmLoading={renameLoading}
        onOk={handleConfirmRename}
        onCancel={() => setRenameOpen(false)}
        destroyOnHidden
      >
        <Input
          autoFocus
          value={renameValue}
          maxLength={15}
          placeholder={locale.rename}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={() => {
            if (!renameLoading) handleConfirmRename();
          }}
        />
      </Modal>
    </>
  );
};

export default ConversationSide;
