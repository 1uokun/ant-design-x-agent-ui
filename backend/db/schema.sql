-- ant-design-x-conversation-fullstack D1 (SQLite) schema
--
-- 设计说明：
-- - 一轮 AI 对话 = 一条 x_message（一问一答）
-- - 消息元数据（x_message）与内容（agent_content）分离存储
-- - 所有 36 位 UUID 业务 ID 由前端生成，后端原样写入
-- - agent_content.sourceId 等于 requestId（用户提问）或 responseId（AI 回答）
-- - agent_content.sourceType：1-user 2-assistant

-- ---------------------------------------------------------------------------
-- x_session — 历史会话
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- x_message — 单轮对话消息（核心表）
-- eventType：0-streaming 1-complete 2-abort 3-error
-- feedbackType：0-无 1-good 2-bad
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- agent_content — 消息内容子表
-- content JSON: {"messages":[{"type":"text/plain","text":"..."}]}
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  createTime TEXT NOT NULL DEFAULT (datetime('now')),
  modifyTime TEXT NOT NULL DEFAULT (datetime('now')),
  sourceType INTEGER NOT NULL DEFAULT 1,
  sourceId TEXT NOT NULL DEFAULT '',
  content TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_content_sourceId ON agent_content (sourceId);
