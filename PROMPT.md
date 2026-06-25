# AI 全栈代码生成提示词

> 将下方「--- 提示词开始 ---」到「--- 提示词结束 ---」之间的内容完整复制给 AI（Cursor / Claude / ChatGPT 等），用于生成 `ant-design-x-agent-ui` 全栈项目。

---

## --- 提示词开始 ---

你是一个资深全栈工程师。请根据以下规格，从零实现一个可运行的开源项目 **ant-design-x-agent-ui**。

## 项目目标

基于 **Ant Design X + React + MySQL** 实现 AI 对话产品的**会话管理**与**消息管理**全栈示例。

核心卖点（必须在代码与 README 中体现）：

1. **一问一答模型**：AI 对话的最小单元是「一轮 Q&A」（用户提问 + AI 回答），不是传统 IM 里两条独立 message
2. **内容与元数据分离**：`x_message` 存轮次元数据，`agent_content` 存实际文本
3. **前端生成全部 UUID**：`sessionId` / `messageId` / `requestId` / `responseId` 均由前端 `uuid v4` 生成，后端**禁止**生成业务 ID，收到后原样存储
4. **SSE 流式输出 + 落库**：流式过程中缓冲 token，结束后写入 `agent_content` 并更新 `eventType`

## 技术栈（固定）

| 层级   | 技术                                                                                        |
| ------ | ------------------------------------------------------------------------------------------- |
| 前端   | React 18 + TypeScript + Vite + [@ant-design/x](https://x.ant.design/) + Ant Design 5 + uuid |
| 后端   | Spring Boot 3 + Java 17 + Spring Data JPA                                                   |
| 数据库 | MySQL 8.x                                                                                   |
| 缓存   | Redis（流式 token 缓冲 + abort 标记 + finalize 分布式锁）                                   |
| 通信   | SSE（`text/event-stream`）调用大模型                                                        |
| 大模型 | OpenAI 兼容 API（`/chat/completions`，`stream: true`）                                      |

## 项目结构

```
ant-design-x-agent-ui/
├── frontend/
│   ├── src/
│   │   ├── pages/Chat/           # 主聊天页
│   │   ├── components/           # Session 列表、Bubble 区等
│   │   ├── hooks/useChat.ts      # 发送、流式、停止、重新生成
│   │   ├── api/                  # REST + SSE 封装
│   │   └── utils/id.ts           # uuid 生成
│   └── package.json
├── backend/
│   ├── src/main/java/.../
│   │   ├── api/                  # Controller
│   │   ├── application/          # Service
│   │   ├── domain/               # Entity
│   │   └── infrastructure/       # Repository, Redis StreamBuffer
│   └── src/main/resources/
│       └── schema.sql
├── docs/
│   └── schema.sql
├── PROMPT.md
└── README.md
```

---

## 一、数据库设计（必须严格实现）

### 表关系

```
x_session (1) ──< (N) x_message
x_message.requestId  ──> agent_content (sourceType=1)
x_message.responseId ──> agent_content (sourceType=2)
```

### DDL（直接使用，字段名不改）

```sql
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

CREATE TABLE `x_message` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `createTime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `modifyTime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `messageId` varchar(36) NOT NULL DEFAULT '' COMMENT '单轮对话uuid，前端生成',
  `sessionId` varchar(36) NOT NULL DEFAULT '' COMMENT '关联 x_session.sessionId',
  `eventType` tinyint(2) unsigned NOT NULL DEFAULT '1' COMMENT '生成状态：0-streaming 1-complete 2-abort 3-error',
  `modelName` varchar(64) NOT NULL DEFAULT '' COMMENT '模型名称',
  `requestId` varchar(36) NOT NULL DEFAULT '' COMMENT '提问内容ID，前端生成',
  `requestTime` datetime NOT NULL DEFAULT '1970-01-01 08:00:00' COMMENT '提问时间',
  `responseId` varchar(36) NOT NULL DEFAULT '' COMMENT '回答内容ID，前端生成',
  `responseTime` datetime NOT NULL DEFAULT '1970-01-01 08:00:00' COMMENT '回答时间',
  `feedbackType` tinyint(1) unsigned NOT NULL DEFAULT '0' COMMENT '用户反馈：0-无 1-good 2-bad',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_messageId` (`messageId`),
  KEY `idx_sessionId_requestTime_id` (`sessionId`,`requestTime`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='X单轮对话消息';

CREATE TABLE `agent_content` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `createTime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `modifyTime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  `sourceType` int(10) unsigned NOT NULL DEFAULT '1' COMMENT '来源类型：1-user 2-assistant',
  `sourceId` varchar(36) NOT NULL DEFAULT '' COMMENT '等于 requestId 或 responseId',
  `content` mediumtext COMMENT 'JSON: {messages:[{type,text}]}',
  PRIMARY KEY (`id`),
  KEY `idx_sourceId` (`sourceId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='x消息内容子表';
```

### 枚举常量

```java
// eventType
STREAMING = 0   // 生成中（运行时状态，落库前）
COMPLETE  = 1
ABORT     = 2
ERROR     = 3

// agent_content.sourceType
USER      = 1
ASSISTANT = 2

// feedbackType
NONE = 0, GOOD = 1, BAD = 2
// API 层用字符串 "good" | "bad"
```

### agent_content.content JSON 格式

```json
{
  "messages": [{ "type": "text/plain", "text": "你好" }]
}
```

---

## 二、API 契约（必须全部实现）

Base path: `/api/v1`

### API 概览

| 功能     | 方法 | 路径                        |
| -------- | ---- | --------------------------- |
| 会话列表 | GET  | `/api/v1/session/page/list` |
| 消息列表 | GET  | `/api/v1/session/msg/list`  |
| 流式对话 | POST | `/api/v1/chat`              |

统一响应外壳（非 SSE 接口）：

```json
{ "success": true, "data": { "page": {}, "list": [] } }
{ "success": false, "message": "错误信息" }
```

列表类接口的 `data` 结构：

```typescript
interface PageList<T> {
  page?: Record<string, unknown>;
  list: T[];
}
```

### 2.1 会话列表

**GET** `/api/v1/session/page/list?userId={userId}`

返回会话列表，按 `lastMessageTime` 降序。

```typescript
interface Session {
  sessionId: string;
  title: string;
  lastMessageTime: string;
  pinned: boolean;
  createTime: string;
  modifyTime: string;
}
```

响应示例：

```json
{
  "success": true,
  "data": {
    "page": {},
    "list": [
      {
        "sessionId": "e5f6g7h8-...",
        "title": "你好",
        "lastMessageTime": "2026-06-23T10:00:03",
        "pinned": false,
        "createTime": "2026-06-23T10:00:00",
        "modifyTime": "2026-06-23T10:00:03"
      }
    ]
  }
}
```

**POST** `/api/v1/session/update` — 更新会话（标题 / 置顶）

```json
{ "sessionId": "uuid", "title": "可选", "pinned": true }
```

**POST** `/api/v1/session/delete` — 删除会话

```json
{ "sessionId": "uuid" }
```

软删除或硬删除均可，列表不再返回。

### 2.2 消息列表

**GET** `/api/v1/session/msg/list?sessionId={sessionId}`

按 `requestTime ASC, id ASC` 返回该会话下所有轮次。

```typescript
interface MessageTurn {
  sessionId: string;
  messageId: string;
  eventType: number; // 0|1|2|3|4
  modelName: string;
  requestId: string;
  responseId: string;
  requestMessages: ContentItem[];
  responseMessages: ContentItem[];
  requestTime: string;
  responseTime: string;
  feedbackType: "good" | "bad" | null;
  createTime?: string;
  modifyTime?: string;
}

interface ContentItem {
  type: string; // "text/plain"
  text: string;
}
```

响应示例：

```json
{
  "success": true,
  "data": {
    "page": {},
    "list": [
      {
        "sessionId": "e5f6g7h8-...",
        "messageId": "a1b2c3d4-...",
        "eventType": 1,
        "modelName": "deepseek-v4-flash",
        "requestId": "req-uuid-...",
        "responseId": "res-uuid-...",
        "requestMessages": [{ "type": "text/plain", "text": "你好" }],
        "responseMessages": [
          { "type": "text/plain", "text": "你好！有什么可以帮你的？" }
        ],
        "requestTime": "2026-06-23T10:00:00",
        "responseTime": "2026-06-23T10:00:03",
        "feedbackType": null
      }
    ]
  }
}
```

**POST** `/api/v1/session/msg/delete` — 删除一轮对话

```json
{ "messageId": "uuid" }
```

### 2.3 流式对话（核心）

**POST** `/api/v1/chat`

- Content-Type: `application/json`
- Accept: `text/event-stream`
- 返回 SSE 流

**Request Body:**

```json
{
  "sessionId": "uuid",
  "messageId": "uuid",
  "requestId": "uuid",
  "responseId": "uuid",
  "modelName": "deepseek-chat",
  "userId": 1,
  "requestMessages": [{ "content": "你好", "mimeType": "text/plain" }]
}
```

**SSE 事件格式:**

```
event: message
data: {"choices":[{"delta":{"content":"你"}}]}

event: message
data: [DONE]
```

出错时：

```
event: error
data: 错误描述
```

### 2.4 停止生成

**POST** `/api/v1/chat/abort`

```json
{
  "sessionId": "uuid",
  "messageId": "uuid"
}
```

**重要**：前端点击「停止」时，**必须先调此接口，再断开 SSE**。不可仅靠断开连接来 abort。

### 2.5 消息反馈

**POST** `/api/v1/session/msg/feedback`

```json
{
  "sessionId": "uuid",
  "messageId": "uuid",
  "feedbackType": "good"
}
```

---

## 三、后端核心业务逻辑（必须严格遵循）

### 3.1 prepareChat（SSE 请求到达时，同步执行）

```
输入: sessionId, messageId, requestId, responseId, requestMessages, userId, modelName

1. upsert x_session
   - sessionId 由前端传入，原样存储
   - 新会话: title = 首条用户文本前 15 字
   - 更新 lastMessageTime = now

2. 若 x_message(messageId) 已存在 → 重新生成场景:
   - 校验 sessionId / requestId / responseId 与库中一致，否则 400
   - 若 eventType == STREAMING(0) → 409 冲突
   - 重置 eventType = STREAMING, feedbackType = 0
   - 删除旧 assistant agent_content（sourceId = responseId）
   - 清理 Redis stream buffer
   - 不新建 x_message 行

3. upsert agent_content (sourceType=USER, sourceId=requestId)
   - content = JSON 序列化 requestMessages

4. 若 x_message 不存在 → 新建:
   - messageId / sessionId / requestId / responseId 全部用前端传入值
   - eventType = STREAMING(0)
   - 禁止后端 UUID.randomUUID() 生成业务 ID
```

### 3.2 streamForward（异步，与 SSE 解耦）

```
1. prepareChat 同步完成后，将本轮请求投递到异步 Worker（Java 异步线程 / Cloudflare Queue 消费者）
2. 异步 Worker 调用大模型 stream API，与 HTTP SSE 连接生命周期无关
3. 每收到 delta → append 本地 buffer + 写入 KV/Redis（key: stream:{sessionId}:{messageId}）
4. HTTP 响应侧轮询 KV/Redis 缓冲推送 SSE（客户端断连只停推送，不中断异步 Worker）
5. 收到 [DONE] → finalize(COMPLETE)
6. 轮询 abort 标记（每 200ms）→ 仅用户主动停止时关闭上游 → finalize(ABORT)
```

**禁止**把上游读取绑在 SSE 连接或 `onCompletion`/`onError` 上，否则刷新页面会导致 eventType 卡在 0。

### 3.3 finalize（幂等，只执行一次）

```
1. Redis SETNX finalize-lock:{sessionId}:{messageId}
2. 读取 Redis stream buffer，与本地 buffer 取较长者
3. 若 message.eventType != STREAMING → return（CAS 兜底）
4. 若有文本:
   - upsert agent_content (sourceType=ASSISTANT, sourceId=responseId)
5. 更新 x_message.eventType = COMPLETE|ABORT|ERROR, responseTime = now
6. 清理 Redis buffer + abort 标记
```

### 3.4 客户端断连 vs 主动停止（关键区别）

| 场景          | 前端行为                               | 后端行为                                                   |
| ------------- | -------------------------------------- | ---------------------------------------------------------- |
| 刷新页面      | 仅断开 SSE                             | **继续**读上游，finalize(COMPLETE)，完整落库               |
| 点击停止      | 先 POST /api/v1/chat/abort，再断开 SSE | 检测 abort 标记，停止上游，finalize(ABORT)，保存已生成部分 |
| SSE 超时 120s | -                                      | finalize(ABORT)                                            |

**禁止**在 `emitter.onCompletion` / `onError` 中直接 finalize(ABORT)，否则刷新页面会导致 eventType 卡在 0 或错误 abort。

### 3.5 Redis Key 设计

```
stream:{sessionId}:{messageId}        # LIST, token 缓冲, TTL 30min
finalize-lock:{sessionId}:{messageId} # SETNX 锁, TTL 30s
abort:{sessionId}:{messageId}         # 主动停止标记, TTL 30min
```

**Cloudflare Workers 落地**：`STREAM_KV` 对应 Redis 缓冲；`CHAT_QUEUE`（`chat-stream`）对应异步线程；`streamRunner` 读上游写 KV，`pollingSse` 轮询 KV 推 SSE。首次部署需 `wrangler queues create chat-stream`。

---

## 四、前端实现要求（Ant Design X）

### 4.1 页面布局

```
┌─────────────────────────────────────────────┐
│  Sessions (左侧)  │  Chat Area (右侧)  │
│  - 新建会话            │  - Bubble.List      │
│  - 会话列表            │  - Sender           │
│  - 置顶/删除           │  - 停止/重新生成    │
└─────────────────────────────────────────────┘
```

使用 Ant Design X 组件：`Sessions`、`Bubble`、`Sender`、`XProvider` 等。

### 4.2 发送消息流程（前端）

```typescript
import { v4 as uuidv4 } from "uuid";

async function sendMessage(text: string) {
  // 1. 若无当前会话，前端生成 sessionId
  const sessionId = currentsessionId ?? uuidv4();

  // 2. 前端生成本轮全部 ID（关键！）
  const messageId = uuidv4();
  const requestId = uuidv4();
  const responseId = uuidv4();

  // 3. 乐观 UI：立即渲染用户 Bubble + AI loading Bubble
  appendTurn({
    messageId,
    requestId,
    responseId,
    userText: text,
    status: "streaming",
  });

  // 4. 发起 SSE
  const abortController = new AbortController();
  streamChat({
    sessionId,
    messageId,
    requestId,
    responseId,
    requestMessages: [{ content: text, mimeType: "text/plain" }],
    onDelta: (chunk) => updateAssistantBubble(messageId, chunk),
    onDone: () => markComplete(messageId),
    onError: (err) => markError(messageId, err),
    signal: abortController.signal,
  });

  // 5. 停止按钮
  stopHandler = async () => {
    await fetch("/api/v1/chat/abort", {
      method: "POST",
      body: JSON.stringify({ sessionId, messageId }),
    });
    abortController.abort();
  };
}
```

### 4.3 重新生成

复用**同一组** `messageId` / `requestId` / `responseId`，只更新 UI 中 assistant 部分为 loading，再次调用 `/api/v1/chat`。

### 4.4 刷新页面恢复

进入会话时 `GET /api/v1/session/msg/list?sessionId={id}`，并对仍在生成的轮次每 2s 轮询一次：

- `eventType === 0` → 显示 loading / 流式更新（`msg/list` 附带 KV 中已生成片段）
- `eventType === 1` → 显示完整回答
- `eventType === 2` → 显示已生成部分 +「已停止」
- `eventType === 3` → 显示错误 + 重试按钮

---

## 五、禁止事项（Hard Constraints）

1. **禁止**后端生成 `sessionId` / `messageId` / `requestId` / `responseId`
2. **禁止**把 user 提问和 assistant 回答存成两条 `x_message` 记录
3. **禁止**在 `x_message` 表直接存大段文本，必须走 `agent_content`
4. **禁止**在 SSE `onCompletion` 时 finalize（区分刷新 vs 停止）
5. **禁止**重新生成时新建 `messageId`，必须复用并校验三元组 ID 一致
6. **禁止** finalize 重复执行（Redis 锁 + eventType CAS 双重保障）

---

## 六、验收标准（全部满足才算完成）

- [ ] 新建会话：前端生成 `sessionId`，发送首条消息后服务端创建 `x_session`
- [ ] 发送消息：前端生成 3 个 message 相关 UUID，乐观渲染，SSE 流式显示
- [ ] 流式结束：`agent_content` 写入 assistant 内容，`eventType` 变为 1
- [ ] 停止生成：abort 接口 + 部分落库，`eventType` 变为 2
- [ ] 刷新页面：SSE 断开后后端仍完成落库，`eventType` 变为 1（不是 0）
- [ ] 重新生成：复用 ID，替换 assistant 内容，`eventType` 1→0→1
- [ ] 会话列表：按 `lastMessageTime` 排序，支持置顶
- [ ] 消息反馈：good/bad 写入 `feedbackType`
- [ ] 删除会话/消息：列表不再返回

---

## 七、实现顺序建议

```
Phase 1: schema.sql + JPA Entity + Repository
Phase 2: 会话 CRUD API + 消息列表 API
Phase 3: prepareChat + SSE 流式 + finalize 落库
Phase 4: Redis StreamBuffer + abort 接口
Phase 5: 前端 Ant Design X 页面 + hooks
Phase 6: 重新生成 + 反馈 + 边界场景
Phase 7: README.md 文档 + docker-compose（MySQL + Redis）
```

---

## 八、输出要求

请按 Phase 顺序生成完整可运行代码，并附带：

1. `README.md`：项目介绍、启动步骤、核心设计说明（一问一答 vs 传统 Chat、前端 UUID）
2. `docs/schema.sql`
3. `docker-compose.yml`（MySQL 8 + Redis）
4. `.env.example`（数据库连接、大模型 API Key）
5. 前端 `README` 说明如何 `npm run dev`
6. 后端 `README` 说明如何 `mvn spring-boot:run`

代码要求：类型完整、错误处理清晰、关键流程加注释，不要伪代码。

## --- 提示词结束 ---
