-- ant-design-x-conversation-fullstack 数据库表结构
--
-- 设计说明：
-- - 一轮 AI 对话 = 一条 x_message（一问一答），而非传统 IM 的两条独立消息
-- - 消息元数据（x_message）与内容（agent_content）分离存储
-- - 所有 36 位 UUID 业务 ID 由前端生成，后端原样写入
-- - agent_content.sourceId 等于 requestId（用户提问）或 responseId（AI 回答）
-- - agent_content.sourceType：1-user 2-assistant

-- ---------------------------------------------------------------------------
-- x_session — 历史会话
-- 一个用户可以有多个会话，每个会话对应 Ant Design X 左侧的一条 Session 记录
-- ---------------------------------------------------------------------------
CREATE TABLE `x_session` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `sessionId` varchar(36) NOT NULL DEFAULT '' COMMENT '会话业务ID，前端生成',
  `createTime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `modifyTime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `userId` bigint(20) unsigned NOT NULL DEFAULT '0' COMMENT '用户ID',
  `title` varchar(15) NOT NULL DEFAULT '' COMMENT '会话标题',
  `lastMessageTime` datetime NOT NULL DEFAULT '1970-01-01 08:00:00' COMMENT '最后消息时间',
  `pinned` tinyint(1) unsigned NOT NULL DEFAULT '0' COMMENT '是否置顶：0-否 1-是',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_sessionId` (`sessionId`),
  KEY `idx_userId` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='X历史会话';

-- ---------------------------------------------------------------------------
-- x_message — 单轮对话消息（核心表）
-- 每一行代表 AI 对话中的一轮（一次提问 + 一次回答）
-- eventType：0-streaming 1-complete 2-abort 3-error
-- feedbackType：0-无 1-good 2-bad
-- ---------------------------------------------------------------------------
CREATE TABLE `x_message` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `createTime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `modifyTime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `messageId` varchar(36) NOT NULL DEFAULT '' COMMENT '单轮对话uuid，前端生成',
  `sessionId` varchar(36) NOT NULL DEFAULT '' COMMENT '关联 x_session.sessionId',
  `eventType` tinyint(2) unsigned NOT NULL DEFAULT '0' COMMENT '生成状态：0-streaming 1-complete 2-abort 3-error',
  `modelName` varchar(64) NOT NULL DEFAULT '' COMMENT '模型名称',
  `requestId` varchar(36) NOT NULL DEFAULT '' COMMENT '提问内容ID，前端生成，关联 agent_content.sourceId',
  `requestTime` datetime NOT NULL DEFAULT '1970-01-01 08:00:00' COMMENT '提问时间',
  `responseId` varchar(36) NOT NULL DEFAULT '' COMMENT '回答内容ID，前端生成，关联 agent_content.sourceId',
  `responseTime` datetime NOT NULL DEFAULT '1970-01-01 08:00:00' COMMENT '回答时间',
  `feedbackType` tinyint(1) unsigned NOT NULL DEFAULT '0' COMMENT '用户反馈：0-无 1-good 2-bad',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_messageId` (`messageId`),
  KEY `idx_sessionId_requestTime_id` (`sessionId`,`requestTime`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='X单轮对话消息';

-- ---------------------------------------------------------------------------
-- agent_content — 消息内容子表
-- content JSON 格式示例：{"messages":[{"type":"text/plain","text":"你好，请介绍一下自己"}]}
-- ---------------------------------------------------------------------------
CREATE TABLE `agent_content` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `createTime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `modifyTime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `sourceType` int(10) unsigned NOT NULL DEFAULT '1' COMMENT '来源类型：1-user 2-assistant',
  `sourceId` varchar(36) NOT NULL DEFAULT '' COMMENT '来源ID，前端生成，等于 requestId 或 responseId',
  `content` mediumtext COMMENT '消息 jsonstring 对象 {messages:[{type, text}]}',
  PRIMARY KEY (`id`),
  KEY `idx_sourceId` (`sourceId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='x消息内容子表';
