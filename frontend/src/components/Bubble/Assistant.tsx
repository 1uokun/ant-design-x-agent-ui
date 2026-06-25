import { GlobalOutlined, SyncOutlined } from "@ant-design/icons";
import { BubbleListProps, ThoughtChainItemProps } from "@ant-design/x";
import { Actions, ThoughtChain } from "@ant-design/x";
import { Pagination } from "antd";
import React from "react";
import locale from "../../_utils/local";
import type { AppChatMessage } from "../../hooks/useConversationChat";
import { ChatContext } from "../ChatContext";
import BubbleXMarkdown from "./XMarkdown";

const createAssistantContentRender = (className: string) => {
  const ContentRender = (content: string, { status }: { status?: string }) => (
    <BubbleXMarkdown
      className={className}
      content={content}
      status={status}
    />
  );
  return ContentRender;
};

const THOUGHT_CHAIN_CONFIG = {
  loading: {
    title: locale.modelIsRunning,
    status: "loading",
  },
  updating: {
    title: locale.modelIsRunning,
    status: "loading",
  },
  error: {
    title: locale.executionFailed,
    status: "error",
  },
  abort: {
    title: locale.aborted,
    status: "abort",
  },
};

const Footer: React.FC<{
  id?: string | number;
  content: string;
  status?: string;
  extraInfo?: AppChatMessage["extraInfo"];
  retrySupported?: boolean;
}> = ({ id, content, extraInfo, status, retrySupported }) => {
  const context = React.useContext(ChatContext);
  const Items = [
    {
      key: "copy",
      actionRender: <Actions.Copy text={content} />,
    },
    {
      key: "feedback",
      actionRender: (
        <Actions.Feedback
          styles={{
            liked: {
              color: "#f759ab",
            },
          }}
          value={extraInfo?.feedback || "default"}
          key="feedback"
          onChange={(val) => {
            if (id && val !== "default") {
              const messageId = String(id).replace(/-request$/, "");
              context?.setMessage?.(id, () => ({
                extraInfo: { feedback: val },
              }));
              if (val === "like" || val === "dislike") {
                context?.onFeedback?.(
                  messageId,
                  val === "like" ? "good" : "bad",
                );
              }
            }
          }}
        />
      ),
    },
    ...(retrySupported
      ? [
          {
            key: "retry",
            label: locale.retry,
            icon: <SyncOutlined />,
            onItemClick: () => {
              if (id) {
                context?.onReload?.(id, {
                  userAction: "retry",
                });
              }
            },
          },
          {
            key: "pagination",
            actionRender: (
              <Pagination simple={{ readOnly: true }} total={1} pageSize={1} />
            ),
          },
        ]
      : []),
  ];
  return status !== "updating" && status !== "loading" ? (
    <div style={{ display: "flex" }}>{id && <Actions items={Items} />}</div>
  ) : null;
};

export const getAssistantRole = (
  className: string,
  options?: {
    lastMessageKey?: string | number | null;
    isLastRoundComplete?: boolean;
  },
): NonNullable<BubbleListProps["role"]>["assistant"] => ({
  placement: "start",
  variant: "borderless",
  styles: {
    root: {
      width: "100%",
      maxWidth: "100%",
      paddingInlineEnd: 0,
    },
    body: {
      width: "100%",
      maxWidth: "100%",
    },
    content: {
      width: "100%",
      maxWidth: "100%",
    },
  },
  header: (_, { status }) => {
    const config =
      THOUGHT_CHAIN_CONFIG[status as keyof typeof THOUGHT_CHAIN_CONFIG];
    return config ? (
      <ThoughtChain.Item
        style={{
          marginBottom: 8,
        }}
        status={config.status as ThoughtChainItemProps["status"]}
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
      extraInfo={extraInfo as AppChatMessage["extraInfo"]}
      id={key as string}
      retrySupported={
        key === options?.lastMessageKey && Boolean(options?.isLastRoundComplete)
      }
    />
  ),
  contentRender: createAssistantContentRender(className),
});
