# Worker API（Cloudflare）

基于 **Cloudflare Workers + D1 + KV** 实现的会话与消息 API，契约与 [PROMPT.md](../PROMPT.md) 一致。

## 技术栈

| 组件 | 用途 |
| ---- | ---- |
| Workers | HTTP API + SSE 流式转发 |
| D1 (SQLite) | 会话 / 消息 / 内容持久化 |
| KV | 流式 token 缓冲、abort 标记、finalize 锁 |

## 本地开发

```bash
# 项目根目录
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars 填入 OPENAI_API_KEY

npm install --prefix worker
npm run db:migrate:local --prefix worker
npm run dev --prefix worker
```

Worker 默认监听 `http://localhost:8787`。

### API 端点

| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| GET | `/api/v1/session/page/list?userId=` | 会话列表 |
| POST | `/api/v1/session/update` | 更新标题/置顶 |
| POST | `/api/v1/session/delete` | 删除会话 |
| GET | `/api/v1/session/msg/list?sessionId=` | 消息轮次列表 |
| POST | `/api/v1/session/msg/delete` | 删除一轮对话 |
| POST | `/api/v1/session/msg/feedback` | 点赞/点踩 |
| POST | `/api/v1/chat` | SSE 流式对话 |
| POST | `/api/v1/chat/abort` | 停止生成 |

## 部署到 Cloudflare

1. 创建 D1 数据库并更新 `wrangler.toml` 中 `database_id`
2. 创建 KV namespace 并更新 `wrangler.toml` 中 KV `id`
3. 设置 Secret：`wrangler secret put OPENAI_API_KEY`
4. 执行迁移：`npm run db:migrate:remote --prefix worker`
5. 部署：`npm run deploy --prefix worker`

## 环境变量

| 变量 | 必填 | 说明 |
| ---- | ---- | ---- |
| `OPENAI_API_KEY` | 是 | 大模型 API Key（Secret） |
| `OPENAI_BASE_URL` | 否 | 默认 `https://api.openai.com/v1` |
| `DEFAULT_MODEL` | 否 | 默认模型名 |
