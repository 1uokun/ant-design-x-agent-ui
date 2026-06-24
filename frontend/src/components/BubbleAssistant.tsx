import { GlobalOutlined, SyncOutlined } from "@ant-design/icons";
import {
  BubbleListProps,
  ThoughtChainItemProps,
  CodeHighlighter,
} from "@ant-design/x";
import { Actions, Think, ThoughtChain } from "@ant-design/x";
import type { ComponentProps } from "@ant-design/x-markdown";
import XMarkdown from "@ant-design/x-markdown";
import { Pagination } from "antd";
import React from "react";
import locale from "../_utils/local";
import type { AppChatMessage } from "../hooks/useConversationChat";
import { ChatContext } from "./ChatContext";
import "./markdown-pc-special-class.css";

const MARKDOWN_PC_CLASS = "markdown-pc-special-class";

const THOUGHT_CHAIN_CONFIG = {
  loading: {
    title: locale.modelIsRunning,
    status: "loading",
  },
  updating: {
    title: locale.modelIsRunning,
    status: "loading",
  },
  // TODO: 成功后暂时以隐藏处理
  // success: {
  //   title: locale.modelExecutionCompleted,
  //   status: "success",
  // },
  error: {
    title: locale.executionFailed,
    status: "error",
  },
  abort: {
    title: locale.aborted,
    status: "abort",
  },
};

const Code: React.FC<ComponentProps> = (props) => {
  const { className, children } = props;
  const lang = className?.match(/language-(\w+)/)?.[1] || "";

  if (typeof children !== "string") return null;
  return <CodeHighlighter lang={lang}>{children}</CodeHighlighter>;
};

const ThinkComponent = React.memo((props: ComponentProps) => {
  const [title, setTitle] = React.useState(`${locale.deepThinking}...`);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (props.streamStatus === "done") {
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
  contentRender: (content: string, { status }) => {
    const newContent = content.replace(/\n\n/g, "<br/><br/>");
    return (
      <div style={{ width: "100%" }}>
        <XMarkdown
          paragraphTag="div"
          components={{
            think: ThinkComponent,
            code: Code,
          }}
          className={`${className} ${MARKDOWN_PC_CLASS}`}
          streaming={{
            hasNextChunk: status === "updating",
            enableAnimation: true,
          }}
        >
          {content}
        </XMarkdown>
      </div>
    );
  },
});
