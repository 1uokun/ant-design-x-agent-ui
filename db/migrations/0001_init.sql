-- Migration: initial schema
-- ant-design-x-conversation-fullstack

CREATE TABLE IF NOT EXISTS x_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId TEXT NOT NULL DEFAULT '' UNIQUE,
  createTime TEXT NOT NULL DEFAULT (datetime('now')),
  modifyTime TEXT NOT NULL DEFAULT (datetime('now')),
  userId INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  lastMessageTime TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
  pinned INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_x_session_userId ON x_session (userId);
CREATE INDEX IF NOT EXISTS idx_x_session_lastMessageTime ON x_session (lastMessageTime DESC);

CREATE TABLE IF NOT EXISTS x_message (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  createTime TEXT NOT NULL DEFAULT (datetime('now')),
  modifyTime TEXT NOT NULL DEFAULT (datetime('now')),
  messageId TEXT NOT NULL DEFAULT '' UNIQUE,
  sessionId TEXT NOT NULL DEFAULT '',
  eventType INTEGER NOT NULL DEFAULT 0,
  modelName TEXT NOT NULL DEFAULT '',
  requestId TEXT NOT NULL DEFAULT '',
  requestTime TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
  responseId TEXT NOT NULL DEFAULT '',
  responseTime TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
  feedbackType INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_x_message_sessionId ON x_message (sessionId, requestTime, id);

CREATE TABLE IF NOT EXISTS agent_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  createTime TEXT NOT NULL DEFAULT (datetime('now')),
  modifyTime TEXT NOT NULL DEFAULT (datetime('now')),
  sourceType INTEGER NOT NULL DEFAULT 1,
  sourceId TEXT NOT NULL DEFAULT '',
  content TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_content_sourceId ON agent_content (sourceId);
