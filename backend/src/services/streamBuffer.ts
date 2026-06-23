import {
  FINALIZE_LOCK_TTL_SECONDS,
  STREAM_TTL_SECONDS,
  finalizeLockKey,
  streamKey,
} from "../constants";

async function readChunks(kv: KVNamespace, key: string): Promise<string[]> {
  const raw = await kv.get(key, "text");
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { chunks?: unknown }).chunks)
    ) {
      return (parsed as { chunks: string[] }).chunks;
    }
  } catch {
    // ignore
  }
  return [];
}

/** 对齐 Java StreamBufferService.appendDelta：RPUSH 原子追加 token */
export async function appendDelta(
  kv: KVNamespace,
  sessionId: string,
  messageId: string,
  deltaText: string,
): Promise<void> {
  if (!sessionId || !messageId || !deltaText) return;

  const key = streamKey(sessionId, messageId);
  try {
    const chunks = await readChunks(kv, key);
    chunks.push(deltaText);
    await kv.put(key, JSON.stringify(chunks), { expirationTtl: STREAM_TTL_SECONDS });
  } catch {
    // 缓冲失败不影响对外 SSE；finalize 可用本地 buffer 兜底
  }
}

/** 对齐 Java StreamBufferService.readAll：LRANGE 0 -1 后 join */
export async function readAll(
  kv: KVNamespace,
  sessionId: string,
  messageId: string,
): Promise<string> {
  if (!sessionId || !messageId) return "";
  const chunks = await readChunks(kv, streamKey(sessionId, messageId));
  return chunks.join("");
}

export async function cleanup(
  kv: KVNamespace,
  sessionId: string,
  messageId: string,
): Promise<void> {
  if (!sessionId || !messageId) return;
  await kv.delete(streamKey(sessionId, messageId));
}

/** 对齐 Java StreamBufferService.tryAcquireFinalizeLock：SETNX 幂等锁 */
export async function tryAcquireFinalizeLock(
  kv: KVNamespace,
  sessionId: string,
  messageId: string,
): Promise<boolean> {
  if (!sessionId || !messageId) return false;

  const key = finalizeLockKey(sessionId, messageId);
  const existing = await kv.get(key);
  if (existing) return false;

  await kv.put(key, crypto.randomUUID(), { expirationTtl: FINALIZE_LOCK_TTL_SECONDS });
  return true;
}

export function pickLongerText(redisText: string, localFallbackText: string): string {
  const remote = redisText ?? "";
  const local = localFallbackText ?? "";
  return remote.length >= local.length ? remote : local;
}
