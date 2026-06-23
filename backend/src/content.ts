import type { ContentItem, RawContentItem } from "./types";

export function normalizeContentItems(items: RawContentItem[]): ContentItem[] {
  return items.map((item) => {
    if ("content" in item && item.content !== undefined) {
      return {
        type: item.mimeType || item.type || "text/plain",
        text: item.content,
      };
    }
    return {
      type: item.type || "text/plain",
      text: item.text || "",
    };
  });
}

export function serializeContent(items: ContentItem[]): string {
  return JSON.stringify({ messages: items });
}

export function parseContent(raw: string | null | undefined): ContentItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { messages?: ContentItem[] };
    return Array.isArray(parsed.messages) ? parsed.messages : [];
  } catch {
    return [];
  }
}

export function feedbackToApi(value: number): "good" | "bad" | null {
  if (value === 1) return "good";
  if (value === 2) return "bad";
  return null;
}

export function feedbackFromApi(value: "good" | "bad"): number {
  return value === "good" ? 1 : 2;
}

export function hasNonBlankContent(raw: string | null | undefined): boolean {
  return parseContent(raw).some((item) => Boolean(item.text?.trim()));
}
