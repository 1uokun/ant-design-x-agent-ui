export interface Env {
  DB: D1Database;
  STREAM_KV: KVNamespace;
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL?: string;
  DEFAULT_MODEL?: string;
}
