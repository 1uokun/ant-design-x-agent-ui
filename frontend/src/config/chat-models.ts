import locale from "../_utils/local";

export type ChatModelTag = "default" | "new" | "code";

export type ChatModelOption = {
  /** 传给 /api/v1/chat 的 modelName */
  modelName: string;
  label: string;
  description: string;
  tags?: ChatModelTag[];
};

/** 上游 GET /v1/models 通常只返回 id，展示文案由 id 规则推断 */
function inferModelMetadata(modelName: string): Omit<ChatModelOption, "modelName"> {
  const slug = modelName.replace(/^deepseek-/, "");
  const words = slug.split("-").filter(Boolean);
  const label = words.length
    ? `DeepSeek ${words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}`
    : modelName;

  let description = locale.modelDescriptionDefault;
  if (slug.includes("flash") || slug.includes("lite") || slug.includes("turbo")) {
    description = locale.modelDescriptionFast;
  } else if (slug.includes("pro") || slug.includes("max") || slug.includes("reasoner")) {
    description = locale.modelDescriptionPro;
  } else if (slug.includes("coder") || slug.includes("code")) {
    description = locale.modelDescriptionCode;
  }

  const tags: ChatModelTag[] = [];
  if (slug.includes("flash") || slug.includes("chat")) tags.push("default");
  if (slug.includes("pro") || slug.includes("reasoner")) tags.push("new");
  if (slug.includes("coder") || slug.includes("code")) tags.push("code");

  return { label, description, ...(tags.length > 0 ? { tags } : {}) };
}

export function createChatModelFromId(modelName: string): ChatModelOption {
  return { modelName, ...inferModelMetadata(modelName) };
}

/** 将上游可用 id 转为 UI 选项 */
export function mergeChatModels(availableIds: string[]): ChatModelOption[] {
  return availableIds.map(createChatModelFromId);
}

/** UI 选项唯一 key */
export function getChatModelKey(model: ChatModelOption): string {
  return `${model.modelName}::${model.label}`;
}

export function findChatModelByKey(
  key: string,
  models: ChatModelOption[] = [],
): ChatModelOption | undefined {
  return models.find((item) => getChatModelKey(item) === key);
}

export function resolveChatModelName(
  key: string,
  models: ChatModelOption[] = [],
  fallback = models[0]?.modelName ?? key.split("::")[0] ?? "",
): string {
  return findChatModelByKey(key, models)?.modelName ?? fallback;
}

export function resolveModelKey(
  modelName: string,
  models: ChatModelOption[] = [],
): string {
  const matched = models.find((item) => item.modelName === modelName);
  return getChatModelKey(matched ?? createChatModelFromId(modelName));
}

export const CHAT_MODEL_STORAGE_KEY = "chat-selected-model";
const LEGACY_CHAT_MODEL_STORAGE_KEY = "chat-selected-model-key";

/** 从 localStorage 读取已选 modelName */
export function readStoredModelName(): string | null {
  try {
    const stored = localStorage.getItem(CHAT_MODEL_STORAGE_KEY);
    if (stored) {
      return stored.includes("::") ? stored.split("::")[0] : stored;
    }

    const legacy = localStorage.getItem(LEGACY_CHAT_MODEL_STORAGE_KEY);
    if (!legacy) return null;

    const modelName = legacy.includes("::") ? legacy.split("::")[0] : legacy;
    writeStoredModelName(modelName);
    localStorage.removeItem(LEGACY_CHAT_MODEL_STORAGE_KEY);
    return modelName;
  } catch {
    return null;
  }
}

/** 将选中的 modelName 写入 localStorage */
export function writeStoredModelName(modelName: string): void {
  localStorage.setItem(CHAT_MODEL_STORAGE_KEY, modelName);
}
