# 开发指南

本文档说明如何在本地运行、联调，以及部署到 Cloudflare。

## 前置要求

- **Node.js** ≥ 18（根目录 `.nvmrc` 指定 `18`，使用 nvm 时执行 `nvm use`）
- **npm** ≥ 9
- 一个大模型平台的 **API Key**（OpenAI / DeepSeek 等 OpenAI 兼容接口）

## 项目结构

```
ant-design-x-conversation-fullstack/
├── frontend/          # React + Vite 静态站点
├── backend/           # Cloudflare Workers API + D1 + KV
├── README.md          # 项目设计与数据模型
├── PROMPT.md          # API 契约与业务规则
└── DEVELOPMENT.md
```

---

## Backend

基于 **Cloudflare Workers + D1 + KV + Hono** 实现会话管理、消息持久化与 SSE 流式对话。所有开发命令均在 `backend/` 目录下执行。

### 技术栈

| 组件 | 用途 |
| ---- | ---- |
| Workers | HTTP API、SSE 流式转发 |
| D1 (SQLite) | 会话 / 消息 / 内容持久化 |
| KV | 流式 token 缓冲、abort 标记、finalize 锁 |
| Hono | 路由与中间件 |

### 目录结构

```
backend/
├── wrangler.toml       # Cloudflare 绑定与运行时配置
├── package.json
├── .dev.vars.example   # 本地密钥模板（复制为 .dev.vars）
├── schema.sql          # MySQL 表结构参考（设计文档用）
├── db/
│   ├── schema.sql      # D1 表结构参考
│   └── migrations/     # D1 迁移文件（wrangler 自动执行）
└── src/
    ├── index.ts        # 路由入口
    ├── db.ts           # D1 数据访问
    ├── services/chat.ts
    └── ...
```

### 本地开发

```bash
cd backend

# 1. 安装依赖
npm install

# 2. 配置密钥（仅本地，勿提交 git）
cp .dev.vars.example .dev.vars

# 3. 初始化 D1 本地库
npm run db:migrate:local

# 4. 启动开发服
npm run dev
```

服务默认监听 **http://localhost:8787**。

验证接口是否正常：

```bash
curl http://localhost:8787/health
# {"ok":true}

curl "http://localhost:8787/api/v1/session/page/list?userId=1"
# {"success":true,"data":{"page":{},"list":[]}}
```

### 环境变量

编辑 `backend/.dev.vars`（本地）：

```env
OPENAI_API_KEY=sk-你的真实key
OPENAI_BASE_URL=https://api.deepseek.com/v1
DEFAULT_MODEL=deepseek-chat
```

| 变量 | 必填 | 本地 | 线上 | 说明 |
| ---- | ---- | ---- | ---- | ---- |
| `OPENAI_API_KEY` | 是 | `.dev.vars` | `wrangler secret put` | 大模型 API Key |
| `OPENAI_BASE_URL` | 否 | `.dev.vars` | `wrangler.toml [vars]` 或 Secret | 兼容 API 地址，默认 `https://api.openai.com/v1` |
| `DEFAULT_MODEL` | 否 | `.dev.vars` | `wrangler.toml [vars]` | 默认模型名 |

`wrangler.toml` 中的 Cloudflare 绑定（本地开发自动模拟，上线前需替换真实 ID）：

```toml
[[d1_databases]]
binding = "DB"
database_id = "<线上 D1 ID>"

[[kv_namespaces]]
binding = "STREAM_KV"
id = "<线上 KV ID>"
```

### 命令一览

| 命令 | 说明 |
| ---- | ---- |
| `npm run dev` | 启动本地 Worker（:8787） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run db:migrate:local` | 应用迁移到本地 D1 |
| `npm run db:migrate:remote` | 应用迁移到线上 D1 |
| `npm run deploy` | 部署 Worker 到 Cloudflare |

### API 端点

Base path：`/api/v1`。类型定义见 `frontend/src/api/message.ts`，完整契约见 [PROMPT.md](./PROMPT.md)。

| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| GET | `/api/v1/session/page/list?userId=` | 会话列表 |
| POST | `/api/v1/session/update` | 更新标题 / 置顶 |
| POST | `/api/v1/session/delete` | 删除会话 |
| GET | `/api/v1/session/msg/list?sessionId=` | 消息轮次列表 |
| POST | `/api/v1/session/msg/delete` | 删除一轮对话 |
| POST | `/api/v1/session/msg/feedback` | 点赞 / 点踩 |
| POST | `/api/v1/chat` | SSE 流式对话 |
| POST | `/api/v1/chat/abort` | 停止生成 |

非 SSE 接口统一响应：

```json
{ "success": true, "data": {} }
{ "success": false, "message": "错误信息" }
```

### 部署到 Cloudflare

首次部署需完成资源创建与配置，之后只需 `db:migrate:remote` + `deploy`。

```bash
cd backend

# 1. 登录 Cloudflare
npx wrangler login

# 2. 创建 D1 与 KV，记录返回的 ID
npx wrangler d1 create ant-design-x-conversation
npx wrangler kv namespace create STREAM_KV

# 3. 将 ID 写入 wrangler.toml（见上方「环境变量」）

# 4. 设置线上密钥
npx wrangler secret put OPENAI_API_KEY

# 5. 迁移数据库并部署
npm run db:migrate:remote
npm run deploy
```

部署成功后访问：

```
https://ant-design-x-conversation.<你的子域>.workers.dev
```

### 数据库迁移

修改表结构时：

1. 在 `backend/db/migrations/` 新增文件，如 `0002_add_xxx.sql`
2. 同步更新 `backend/db/schema.sql` 作为参考
3. 本地验证：`npm run db:migrate:local`
4. 上线执行：`npm run db:migrate:remote`

本地 D1 数据存放在 `backend/.wrangler/state/`，已在 `.gitignore` 中排除。

### 常见问题

**端口 8787 被占用**

```bash
lsof -ti:8787 | xargs kill -9
npm run dev
```

或修改 `backend/wrangler.toml` 中 `[dev] port`。

**流式对话返回认证错误**

检查 `backend/.dev.vars` 中 `OPENAI_API_KEY` 是否有效，`OPENAI_BASE_URL` 是否与 Key 所属平台一致。

**重新生成报「该轮对话正在生成中」(409)**

上一轮 `eventType` 仍为 `0`（streaming），通常是上次请求异常中断。删除该轮消息后重试，或调用 `POST /api/v1/session/msg/delete`。

---

## Frontend

技术栈：**Vite 6 + React 18 + TypeScript**，产物为静态 `dist/`，可部署到 GitHub Pages。

### 目录结构

```
frontend/
├── index.html
├── vite.config.ts
├── package.json
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── api/message.ts
    ├── _utils/local.ts
    └── x-markdown/
```

### 本地开发

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

### 打包与部署

```bash
cd frontend
npm run build              # dist/，base 为 /
npm run build:gh-pages     # GitHub Pages 专用 base path
npm run preview            # 本地预览 dist
```

GitHub Pages 步骤：

1. 执行 `npm run build:gh-pages`（仓库名非 `ant-design-x-conversation-fullstack` 时需改 `package.json` 中 `VITE_BASE`）
2. 将 `frontend/dist/` 推送到 `gh-pages` 分支，或使用 GitHub Actions
3. 仓库 Settings → Pages → Source 选 `gh-pages` / `(root)`

---

## 全栈联调

前端 `vite.config.ts` 已将 `/api` 代理到 `http://localhost:8787`，两个终端分别启动：

```bash
# 终端 1 — API
cd backend && npm run dev

# 终端 2 — 前端
cd frontend && npm run dev
```

浏览器访问 http://localhost:5173，请求 `/api/v1/...` 会自动转发到 Worker。

**线上注意**：GitHub Pages 仅托管静态资源，API 需单独部署到 Cloudflare Workers；可通过 Pages 路由 `/api/*` → Worker，或在前端配置 API 基地址指向 Worker 域名。

---

## 相关文档

- [README.md](./README.md) — 项目设计与数据模型
- [PROMPT.md](./PROMPT.md) — 完整 API 契约与业务规则
- [backend/README.md](./backend/README.md) — Backend 速查
