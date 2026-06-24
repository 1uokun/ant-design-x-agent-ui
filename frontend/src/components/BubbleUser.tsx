import {
  CheckOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  UpOutlined,
} from "@ant-design/icons";
import { Actions } from "@ant-design/x";
import type {
  BubbleItemType,
  FuncRoleProps,
} from "@ant-design/x/es/bubble/interface";
import { Modal } from "antd";
import { createStyles } from "antd-style";
import React from "react";
import locale from "../_utils/local";
import type { AppChatMessage } from "../hooks/useConversationChat";
import { ChatContext } from "./ChatContext";
import "./bubble-user.css";

const COLLAPSED_HEIGHT = 80;
const USER_BUBBLE_BG = "#ebf5ff";

type UserContent = AppChatMessage["content"];

export const getUserText = (content: UserContent): string => {
  if (typeof content === "string") return content;
  return content.text || "";
};

export const getEditableText = (content: UserContent): string =>
  getUserText(content).replace(/\r\n/g, "\n");

const hasUserImages = (content: UserContent): boolean =>
  typeof content !== "string" && Boolean(content.imageUrls?.length);

type ChatMessageListItem = {
  id?: string | number;
  status?: string;
  message: AppChatMessage;
};

/** 从消息列表中找到最后一条用户消息的 bubble id（兼容 msg_* 与 *-request） */
export const findLastUserMessageKey = (
  messages: ChatMessageListItem[] | undefined,
): string | number | null => {
  if (!messages?.length) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const item = messages[i];
    if (item.message.role === "user" && item.id != null) {
      return item.id;
    }
  }
  return null;
};

/** 最后一轮助手回复已结束（非 loading / updating） */
export const isLastRoundComplete = (
  messages: ChatMessageListItem[] | undefined,
): boolean => {
  const last = messages?.at(-1);
  if (!last || last.message.role !== "assistant") return false;
  return last.status !== "loading" && last.status !== "updating";
};

export const isLastUserMessage = (
  key: string | number | null | undefined,
  lastUserMessageKey: string | number | null,
): boolean => {
  if (key == null || lastUserMessageKey == null) return false;
  return String(key) === String(lastUserMessageKey);
};

const useContentStyle = createStyles(({ css }) => ({
  contentWrap: css`
    position: relative;
    width: 100%;
    min-width: 0;
  `,
  contentCollapsed: css`
    max-height: ${COLLAPSED_HEIGHT}px;
    overflow: hidden;
  `,
  text: css`
    white-space: pre-line;
    word-break: break-all;
    overflow-wrap: break-word;
  `,
  imageList: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  `,
  image: css`
    max-width: 100%;
    border-radius: 8px;
  `,
  fade: css`
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 48px;
    pointer-events: none;
    background: linear-gradient(
      180deg,
      rgba(235, 245, 255, 0) 0%,
      ${USER_BUBBLE_BG} 100%
    );
  `,
}));

const Footer: React.FC<{
  id?: string | number;
  content: UserContent;
  status?: string;
  extraInfo?: AppChatMessage["extraInfo"];
  editableSupported?: boolean;
}> = ({ id, content, extraInfo, status, editableSupported }) => {
  const context = React.useContext(ChatContext);
  const text = getUserText(content);
  const editing = extraInfo?.editing;
  const canCollapse = extraInfo?.userCanCollapse;
  const collapsed = extraInfo?.userCollapsed ?? false;

  const handleDelete = () => {
    if (!id) return;
    Modal.confirm({
      title: locale.delete,
      content: locale.deleteMessageConfirm,
      onOk: async () => {
        await context?.onDeleteMessage?.(id);
      },
    });
  };

  const handleToggleCollapse = () => {
    if (!id) return;
    context?.setMessage?.(id, (msg) => ({
      extraInfo: {
        ...msg.extraInfo,
        userCollapsed: !(msg.extraInfo?.userCollapsed ?? false),
      },
    }));
  };

  const actionItems = editing
    ? [
        {
          key: "done",
          label: locale.done,
          icon: <CheckOutlined />,
          onItemClick: () => {
            if (id != null) {
              context?.onToggleUserMessageEdit?.(id, false);
            }
          },
        },
      ]
    : [
        {
          key: "copy",
          actionRender: <Actions.Copy text={text} />,
        },
        ...(editableSupported
          ? [
              {
                key: "edit",
                label: locale.edit,
                icon: <EditOutlined />,
                onItemClick: () => {
                  if (id != null) {
                    context?.onToggleUserMessageEdit?.(id, true);
                  }
                },
              },
            ]
          : []),
        {
          key: "delete",
          label: locale.delete,
          icon: <DeleteOutlined />,
          onItemClick: handleDelete,
        },
        ...(canCollapse
          ? [
              {
                key: "collapse",
                label: collapsed ? locale.expand : locale.collapse,
                icon: collapsed ? <DownOutlined /> : <UpOutlined />,
                onItemClick: handleToggleCollapse,
              },
            ]
          : []),
      ];

  if (!id || status === "updating" || status === "loading") return null;

  return (
    <div className="user-bubble-footer">
      <Actions items={actionItems} />
    </div>
  );
};

const UserBubbleContent: React.FC<{
  content: UserContent;
  id?: string | number;
  extraInfo?: AppChatMessage["extraInfo"];
}> = ({ content, id, extraInfo }) => {
  const { styles, cx } = useContentStyle();
  const context = React.useContext(ChatContext);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const text = getUserText(content);
  const canCollapse = extraInfo?.userCanCollapse ?? false;
  const collapsed = extraInfo?.userCollapsed ?? false;
  const editing = extraInfo?.editing;

  React.useLayoutEffect(() => {
    if (editing) return;
    const el = measureRef.current;
    if (!el || !id) return;
    const overflow = el.scrollHeight > COLLAPSED_HEIGHT;
    if (overflow === extraInfo?.userCanCollapse) return;
    context?.setMessage?.(id, (msg) => ({
      extraInfo: {
        ...msg.extraInfo,
        userCanCollapse: overflow,
        userCollapsed: overflow ? (msg.extraInfo?.userCollapsed ?? false) : undefined,
      },
    }));
  }, [text, id, context, extraInfo?.userCanCollapse, editing]);

  return (
    <div
      className={cx(
        styles.contentWrap,
        canCollapse && collapsed && !editing && styles.contentCollapsed,
      )}
    >
      <div ref={measureRef} className={styles.text}>
        {typeof content === "string" ? (
          content
        ) : (
          <>
            {content.text}
            {content.imageUrls?.length ? (
              <div className={styles.imageList}>
                {content.imageUrls.map((url) => (
                  <img key={url} src={url} alt="" className={styles.image} />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
      {canCollapse && collapsed && !editing ? <div className={styles.fade} /> : null}
    </div>
  );
};

export type CreateUserRoleOptions = {
  lastUserMessageKey: string | number | null;
  isLastRoundComplete: boolean;
  onEditUserMessage?: (messageKey: string | number, content: string) => void;
  onCancelUserMessageEdit?: (messageKey: string | number) => void;
};

export const createUserRole = (
  options: CreateUserRoleOptions,
): FuncRoleProps => {
  return (data: BubbleItemType) => {
    const editableSupported =
      options.isLastRoundComplete &&
      !hasUserImages(data.content as UserContent) &&
      isLastUserMessage(data.key, options.lastUserMessageKey);

    return {
      placement: "end",
      variant: "filled",
      typing: false,
      rootClassName: "user-bubble-root",
      classNames: {
        content: "user-bubble-content",
      },
      styles: {
        content: {
          backgroundColor: USER_BUBBLE_BG,
          color: "#222",
          borderRadius: 16,
          padding: "10px 16px",
          fontSize: 16,
          lineHeight: "26px",
          boxSizing: "border-box",
          maxWidth: "100%",
        },
        footer: {
          marginBlockStart: 8,
        },
      },
      editable: editableSupported
        ? { editing: !!data.extraInfo?.editing }
        : false,
      onEditConfirm: (content: string) => {
        if (data.key != null) {
          options.onEditUserMessage?.(data.key, content);
        }
      },
      onEditCancel: () => {
        if (data.key != null) {
          options.onCancelUserMessageEdit?.(data.key);
        }
      },
      contentRender: (content, { key, extraInfo }) => (
        <UserBubbleContent
          content={content as UserContent}
          id={key}
          extraInfo={extraInfo as AppChatMessage["extraInfo"]}
        />
      ),
      footer: (content, { key, extraInfo, status }) => (
        <Footer
          content={content as UserContent}
          id={key}
          status={status}
          extraInfo={extraInfo as AppChatMessage["extraInfo"]}
          editableSupported={editableSupported}
        />
      ),
    };
  };
};
