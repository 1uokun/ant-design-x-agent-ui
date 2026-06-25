import { CheckOutlined, DownOutlined } from "@ant-design/icons";
import { Button, Dropdown, Flex, Tag, Typography } from "antd";
import { createStyles } from "antd-style";
import React, { useMemo } from "react";
import {
  findChatModelByKey,
  getChatModelKey,
  type ChatModelOption,
  type ChatModelTag,
} from "../../config/chat-models";
import locale from "../../_utils/local";
import SidebarToggle from "./SidebarToggle";

const useStyle = createStyles(({ css }) => ({
  sidebarToggleSlot: css`
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: center;
    width: 0;
    height: 40px;
    opacity: 0;
    overflow: hidden;
    pointer-events: none;
    transition:
      width 0.28s cubic-bezier(0.4, 0, 0.2, 1),
      opacity 0.2s ease;
  `,
  sidebarToggleVisible: css`
    width: 18px;
    opacity: 1;
    pointer-events: auto;
  `,
}));

const TAG_LABEL: Record<ChatModelTag, string> = {
  default: locale.modelTagDefault,
  new: locale.modelTagNew,
  code: locale.modelTagCode,
};

const TAG_COLOR: Record<ChatModelTag, string> = {
  default: "default",
  new: "processing",
  code: "default",
};

export type ModelSelectorProps = {
  value: string;
  onChange: (modelKey: string) => void;
  models: ChatModelOption[];
  disabled?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
};

const ModelSelector: React.FC<ModelSelectorProps> = ({
  value,
  onChange,
  models,
  disabled,
  sidebarCollapsed = false,
  onToggleSidebar,
}) => {
  const { styles, cx } = useStyle();
  const [open, setOpen] = React.useState(false);
  const selected = useMemo(
    () => findChatModelByKey(value, models) ?? models[0],
    [value, models],
  );

  return (
    <Flex
      align="center"
      gap={4}
      style={{
        height: 56,
        padding: "0 15px",
      }}
    >
      {onToggleSidebar ? (
        <div
          className={cx(
            styles.sidebarToggleSlot,
            sidebarCollapsed && styles.sidebarToggleVisible,
          )}
        >
          <SidebarToggle collapsed onToggle={onToggleSidebar} />
        </div>
      ) : null}
      <Dropdown
        open={open}
        onOpenChange={setOpen}
        disabled={disabled}
        trigger={["click"]}
        placement="bottomLeft"
        popupRender={() => (
          <div
            style={{
              width: 360,
              padding: "12px 8px 8px",
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 6px 16px rgba(0,0,0,0.08)",
            }}
          >
            <Typography.Text
              strong
              style={{ display: "block", padding: "0 8px 8px" }}
            >
              模型
            </Typography.Text>
            {models.map((model) => {
              const key = getChatModelKey(model);
              const active = key === value;
              return (
                <Flex
                  key={key}
                  gap={8}
                  align="flex-start"
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    cursor: "pointer",
                    background: active ? "#f0f5ff" : undefined,
                  }}
                >
                  <Flex vertical gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <Flex gap={6} wrap="wrap" align="center">
                      <Typography.Text>{model.label}</Typography.Text>
                      {model.tags?.map((tag) => (
                        <Tag key={tag} color={TAG_COLOR[tag]}>
                          {TAG_LABEL[tag]}
                        </Tag>
                      ))}
                    </Flex>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {model.description}
                    </Typography.Text>
                  </Flex>
                  {active ? (
                    <CheckOutlined style={{ color: "#1677ff", marginTop: 2 }} />
                  ) : null}
                </Flex>
              );
            })}
          </div>
        )}
      >
        <Button
          icon={<DownOutlined />}
          type="text"
          iconPlacement="end"
          size="large"
        >
          {selected?.label}
        </Button>
      </Dropdown>
    </Flex>
  );
};

export default ModelSelector;
