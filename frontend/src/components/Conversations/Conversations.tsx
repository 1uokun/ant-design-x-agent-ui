import {
  DeleteOutlined,
  EditOutlined,
  PushpinOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import { Conversations as AntConversations } from "@ant-design/x";
import { Avatar, Button, Input, Modal } from "antd";
import { createStyles } from "antd-style";
import React, { useState } from "react";
import locale from "../../_utils/local";
import type { Conversation } from "../../api/message";
import Logo from "./Logo";

export const SIDEBAR_WIDTH = 256;

const useStyle = createStyles(({ token, css }) => ({
  side: css`
    background: ${token.colorBgLayout}80;
    width: ${SIDEBAR_WIDTH}px;
    min-width: ${SIDEBAR_WIDTH}px;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 0 12px;
    box-sizing: border-box;
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
  onTogglePin?: (key: string, pinned: boolean) => void;
  onToggleCollapse: () => void;
};

const ConversationSide: React.FC<ConversationSideProps> = ({
  conversations,
  activeConversationKey,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onTogglePin,
  onToggleCollapse,
}) => {
  const { styles } = useStyle();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameKey, setRenameKey] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);

  const handleOpenRename = (key: string, title?: string) => {
    setRenameKey(key);
    setRenameValue(
      String(title || "").replace(`[${locale.curConversation}]`, ""),
    );
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
      okButtonProps: { danger: true },
      onOk: () => onDelete(key),
    });
  };

  return (
    <>
      <div className={styles.side}>
        <Logo onToggleCollapse={onToggleCollapse} onCreate={onCreate} />
        <AntConversations
          items={conversations.map(({ key, label, ...other }) => ({
            key,
            label:
              key === activeConversationKey
                ? `[${locale.curConversation}]${label}`
                : label,
            ...other,
          }))}
          className={styles.conversations}
          activeKey={activeConversationKey}
          onActiveChange={onSelect}
          groupable
          styles={{ item: { padding: "0 8px" } }}
          menu={(conversation) => {
            const pinned = Boolean(
              conversations.find((item) => item.key === conversation.key)
                ?.pinned,
            );
            return {
              items: [
                {
                  label: pinned ? locale.unpinFromTop : locale.pinToTop,
                  key: "pin",
                  icon: <PushpinOutlined />,
                  onClick: () => onTogglePin?.(conversation.key, !pinned),
                },
                {
                  label: locale.rename,
                  key: "rename",
                  icon: <EditOutlined />,
                  onClick: () =>
                    handleOpenRename(
                      conversation.key,
                      String(conversation.label ?? ""),
                    ),
                },
                {
                  label: locale.delete,
                  key: "delete",
                  icon: <DeleteOutlined />,
                  danger: true,
                  onClick: () => confirmDeleteConversation(conversation.key),
                },
              ],
            };
          }}
        />
        <div className={styles.sideFooter}>
          <Avatar size={24} />
          <Button type="text" icon={<QuestionCircleOutlined />} />
        </div>
      </div>
      <Modal
        title={locale.rename}
        open={renameOpen}
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
