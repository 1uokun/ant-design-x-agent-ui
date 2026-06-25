import type { ChatRequestBody } from "./types";

export interface Env {
  DB: D1Database;
  STREAM_KV: KVNamespace;
  CHAT_QUEUE?: Queue<ChatRequestBody>;
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL?: string;
  DEFAULT_MODEL?: string;
}
