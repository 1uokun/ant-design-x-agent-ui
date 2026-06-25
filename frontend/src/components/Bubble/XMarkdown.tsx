import { CodeHighlighter } from "@ant-design/x";
import { Think } from "@ant-design/x";
import type { ComponentProps } from "@ant-design/x-markdown";
import AntXMarkdown from "@ant-design/x-markdown";
import React from "react";
import locale from "../../_utils/local";
import "./styles/markdown-pc-special-class.css";

const MARKDOWN_PC_CLASS = "markdown-pc-special-class";

/** 超过该长度时关闭块级淡入动画，避免大段 Markdown 流式输出卡顿 */
const ANIMATION_CONTENT_MAX = 8_000;

const Code: React.FC<ComponentProps> = React.memo((props) => {
  const { className, children } = props;
  const lang = className?.match(/language-(\w+)/)?.[1] || "";

  if (typeof children !== "string") return null;
  return <CodeHighlighter lang={lang}>{children}</CodeHighlighter>;
});

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

const MARKDOWN_COMPONENTS = {
  think: ThinkComponent,
  code: Code,
};

export type BubbleXMarkdownProps = {
  className: string;
  content: string;
  status?: string;
};

const BubbleXMarkdown: React.FC<BubbleXMarkdownProps> = ({
  className,
  content,
  status,
}) => {
  const isStreaming = status === "updating";
  const enableAnimation =
    isStreaming && content.length <= ANIMATION_CONTENT_MAX;

  const streaming = React.useMemo(
    () => ({
      hasNextChunk: isStreaming,
      enableAnimation,
    }),
    [isStreaming, enableAnimation],
  );

  const mergedClassName = React.useMemo(
    () => `${className} ${MARKDOWN_PC_CLASS}`,
    [className],
  );

  return (
    <div className="bubble-x-markdown" style={{ width: "100%" }}>
      <AntXMarkdown
        paragraphTag="div"
        components={MARKDOWN_COMPONENTS}
        className={mergedClassName}
        streaming={streaming}
      >
        {content}
      </AntXMarkdown>
    </div>
  );
};

function propsAreEqual(
  prev: BubbleXMarkdownProps,
  next: BubbleXMarkdownProps,
): boolean {
  return (
    prev.content === next.content &&
    prev.status === next.status &&
    prev.className === next.className
  );
}

export default React.memo(BubbleXMarkdown, propsAreEqual);
