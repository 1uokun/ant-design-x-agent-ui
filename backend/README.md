# Backend API（Cloudflare）

基于 **Cloudflare Workers + D1 + KV** 实现的会话与消息 API，契约与 [PROMPT.md](../PROMPT.md) 一致。

## 目录结构

```
backend/
├── schema.sql          # MySQL 表结构参考（设计文档用）
├── wrangler.toml       # Cloudflare 配置
├── package.json
├── .dev.vars.example   # 本地环境变量模板
├── db/
│   ├── schema.sql      # D1 (SQLite) 表结构
│   └── migrations/     # D1 迁移文件
└── src/
    ├── index.ts        # Hono 路由入口
    ├── db.ts           # D1 数据访问
    └── services/chat.ts
```

## 本地开发

```bash
cd backend
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars 填入 OPENAI_API_KEY

npm install
npm run db:migrate:local
npm run dev
```

Worker 默认监听 `http://localhost:8787`。

## 部署到 Cloudflare

```bash
cd backend
npx wrangler login
npx wrangler d1 create ant-design-x-conversation
npx wrangler kv namespace create STREAM_KV
# 将 ID 写入 wrangler.toml

npx wrangler secret put OPENAI_API_KEY
npm run db:migrate:remote
npm run deploy
```

## 环境变量

| 变量 | 必填 | 说明 |
| ---- | ---- | ---- |
| `OPENAI_API_KEY` | 是 | 大模型 API Key（`.dev.vars` / Secret） |
| `OPENAI_BASE_URL` | 否 | 兼容 API 地址 |
| `DEFAULT_MODEL` | 否 | 默认模型名 |
