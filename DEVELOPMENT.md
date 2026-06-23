# 开发指南

本文档说明如何在本地运行、联调，以及部署到 Cloudflare。

## 前置要求

- **Node.js** ≥ 18
- **npm** ≥ 9
- 一个大模型平台的 **API Key**（OpenAI / DeepSeek 等 OpenAI 兼容接口）

## 项目结构

```
ant-design-x-conversation-fullstack/
├── frontend/          # React + Vite（自行脱敏后放入）
├── worker/            # Cloudflare Workers API
│   └── src/
├── db/
│   ├── schema.sql     # 表结构参考
│   └── migrations/    # D1 迁移文件
├── wrangler.toml      # Cloudflare 配置
├── .dev.vars.example  # 本地环境变量模板
└── package.json       # 根目录脚本（dev / deploy / migrate）
```

## 快速开始（仅后端 API）

### 1. 安装依赖

```bash
npm install
npm install --prefix worker
```

### 2. 配置环境变量

```bash
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`：

```env
OPENAI_API_KEY=sk-你的真实key
OPENAI_BASE_URL=https://api.deepseek.com/v1
DEFAULT_MODEL=deepseek-chat
```

| 变量              | 必填 | 说明                                                |
| ----------------- | ---- | --------------------------------------------------- |
| `OPENAI_API_KEY`  | 是   | 大模型 API Key，仅放 `.dev.vars`，勿提交 git        |
| `OPENAI_BASE_URL` | 否   | 兼容 API 地址，默认 `https://api.openai.com/v1`     |
| `DEFAULT_MODEL`   | 否   | 默认模型，也可在 `wrangler.toml` 的 `[vars]` 中配置 |

### 3. 初始化本地数据库

```bash
npm run db:migrate:local
```

会在 `.wrangler/state/` 下创建本地 D1 数据库并执行 `db/migrations/` 中的迁移。

### 4. 启动 Worker

```bash
npm run dev
```

默认地址：**http://localhost:8787**

验证：

```bash
curl http://localhost:8787/health
# {"ok":true}

curl "http://localhost:8787/api/v1/session/page/list?userId=1"
# {"success":true,"data":{"page":{},"list":[]}}
```

## 常用命令

| 命令                        | 说明                                           |
| --------------------------- | ---------------------------------------------- |
| `npm run dev`               | 本地启动 Worker（端口 8787）                   |
| `npm run db:migrate:local`  | 应用 D1 迁移到本地库                           |
| `npm run db:migrate:remote` | 应用 D1 迁移到线上库（需先配置 `database_id`） |
| `npm run deploy`            | 部署 Worker 到 Cloudflare                      |
| `npm run typecheck`         | Worker TypeScript 类型检查                     |

## API 端点

Base path：`/api/v1`

| 方法 | 路径                                  | 说明            |
| ---- | ------------------------------------- | --------------- |
| GET  | `/api/v1/session/page/list?userId=`   | 会话列表        |
| POST | `/api/v1/session/update`              | 更新标题 / 置顶 |
| POST | `/api/v1/session/delete`              | 删除会话        |
| GET  | `/api/v1/session/msg/list?sessionId=` | 消息轮次列表    |
| POST | `/api/v1/session/msg/delete`          | 删除一轮对话    |
| POST | `/api/v1/session/msg/feedback`        | 点赞 / 点踩     |
| POST | `/api/v1/chat`                        | SSE 流式对话    |
| POST | `/api/v1/chat/abort`                  | 停止生成        |

统一响应格式（非 SSE）：

```json
{ "success": true, "data": {} }
{ "success": false, "message": "错误信息" }
```

类型定义见 `frontend/src/api/message.ts`。

## 前端（Vite + React）

技术栈：**Vite 6 + React 18 + TypeScript**，产物为静态 `dist/`，可部署到 GitHub Pages。

### 目录结构

```
frontend/
├── index.html
├── vite.config.ts
├── package.json
└── src/
    ├── main.tsx          # 入口
    ├── App.tsx           # 主页面
    ├── api/message.ts    # API 类型
    ├── _utils/local.ts   # 国际化
    └── x-markdown/       # Markdown 主题工具
```

### 本地开发

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

`vite.config.ts` 已将 `/api` 代理到 `http://localhost:8787`，需同时启动 Worker：

```bash
# 终端 1（项目根目录）
npm run dev

# 终端 2
cd frontend && npm run dev
```

### 打包

```bash
cd frontend
npm run build              # 产物在 dist/，base 为 /
npm run build:gh-pages     # GitHub Pages，base 为 /ant-design-x-conversation-fullstack/
npm run preview            # 本地预览 dist
```

### 部署到 GitHub Pages

1. 若仓库名为 `ant-design-x-conversation-fullstack`，直接执行 `npm run build:gh-pages`
2. 将 `frontend/dist/` 内容推送到 `gh-pages` 分支，或使用 GitHub Actions
3. 仓库 Settings → Pages → Source 选 `gh-pages` 分支 `/ (root)`

若仓库名不同，修改 `package.json` 中 `build:gh-pages` 的 `VITE_BASE` 为你的仓库名路径。

**注意**：GitHub Pages 仅托管静态前端；API 需单独部署 Worker，并在前端将请求地址指向线上 Worker（同域路由或环境变量）。

## 部署到 Cloudflare

### 1. 登录

```bash
npx wrangler login
```

### 2. 创建 D1 与 KV

```bash
npx wrangler d1 create ant-design-x-conversation
npx wrangler kv namespace create STREAM_KV
```

将返回的 ID 写入 `wrangler.toml`：

```toml
[[d1_databases]]
database_id = "<D1 返回的 database_id>"

[[kv_namespaces]]
id = "<KV 返回的 id>"
```

### 3. 设置线上 Secret

```bash
npx wrangler secret put OPENAI_API_KEY
```

非敏感变量可写在 `wrangler.toml` 的 `[vars]` 中，或通过 Dashboard → Workers → Settings → Variables 配置。

### 4. 迁移并部署

```bash
npm run db:migrate:remote
npm run deploy
```

部署成功后访问：

```
https://ant-design-x-conversation.<你的子域>.workers.dev
```

### 5. 前端线上部署（可选）

- **Cloudflare Pages**：部署 `frontend` 构建产物
- 推荐同域路由：`/api/*` → Worker，`/*` → Pages 静态资源
- 或在前端设置 `VITE_API_BASE=https://xxx.workers.dev`

## Cloudflare 资源对照

| 资源    | 用途                  | 本地开发                | 线上                             |
| ------- | --------------------- | ----------------------- | -------------------------------- |
| Workers | HTTP API + SSE        | `wrangler dev` 自动模拟 | `wrangler deploy`                |
| D1      | 会话 / 消息持久化     | 本地 `.wrangler/state/` | Dashboard 创建后填 `database_id` |
| KV      | 流式缓冲 / abort / 锁 | 本地自动模拟            | Dashboard 创建后填 `id`          |
| Secret  | `OPENAI_API_KEY`      | `.dev.vars`             | `wrangler secret put`            |

## 常见问题

### 端口 8787 被占用

```bash
lsof -ti:8787 | xargs kill -9
npm run dev
```

或修改 `wrangler.toml` 中 `[dev] port`。

### 流式对话返回认证错误

检查 `.dev.vars` 中 `OPENAI_API_KEY` 是否有效，`OPENAI_BASE_URL` 是否与 Key 所属平台一致。

### 重新生成报「该轮对话正在生成中」(409)

上一轮 `eventType` 仍为 `0`（streaming），通常是上次请求异常中断。可删除该条消息后重试，或调 `POST /api/v1/session/msg/delete`。

### 修改数据库结构

1. 在 `db/migrations/` 新增迁移文件（如 `0002_xxx.sql`）
2. 同步更新 `db/schema.sql` 作为参考
3. 执行 `npm run db:migrate:local`（或 `remote`）

## 相关文档

- [README.md](./README.md) — 项目设计与数据模型
- [PROMPT.md](./PROMPT.md) — 完整 API 契约与业务规则
- [worker/README.md](./worker/README.md) — Worker 实现说明
