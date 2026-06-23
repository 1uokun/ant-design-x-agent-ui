/** x_message.eventType */
export const EventType = {
  STREAMING: 0,
  COMPLETE: 1,
  ABORT: 2,
  ERROR: 3,
} as const;

/** agent_content.sourceType */
export const SourceType = {
  USER: 1,
  ASSISTANT: 2,
} as const;

/** x_message.feedbackType */
export const FeedbackType = {
  NONE: 0,
  GOOD: 1,
  BAD: 2,
} as const;

export const STREAM_TTL_SECONDS = 30 * 60;
export const FINALIZE_LOCK_TTL_SECONDS = 60;
export const CHAT_TIMEOUT_MS = 120_000;
export const ABORT_POLL_MS = 200;

export function streamKey(sessionId: string, messageId: string) {
  return `stream:${sessionId}:${messageId}`;
}

export function abortKey(sessionId: string, messageId: string) {
  return `abort:${sessionId}:${messageId}`;
}

export function finalizeLockKey(sessionId: string, messageId: string) {
  return `finalize-lock:${sessionId}:${messageId}`;
}
