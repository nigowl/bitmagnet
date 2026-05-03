# bitmagnet（比特磁铁）

一个基于 `Go + Next.js + Mantine` 的 bitmagnet 增强版全栈工作区，面向影视播放与检索场景。

## 功能特点

- 全链路媒体空间：种子检索、影视页、在线播放、详情页、收藏与管理员后台（监控 / 队列 / 设置 / 日志 / 维护）全部打通。
- 队列管理更强：支持任务聚合统计、筛选排序、任务详情展开、按任务类型清理、队列清理阈值配置。
- 封面缓存更快：封面缺失时异步入队，前端先返回“加载中”临时封面，缓存完成后自动命中本地文件。
- 封面缓存更稳：同一媒体封面任务去重入队，下载失败会记录错误并带远端 `source_url` 日志，便于排查。
- 队列自动保洁：已完成/失败任务每天凌晨 `02:00` 自动清理，按“最大保留条数 + 最大保留天数”双阈值控制。
- 维护任务标准化：`/maintenance` 页面提交的是队列任务，实际执行统一由 queue worker 处理。
- 运维可视化：监控页展示健康状态、worker 状态、队列指标、种子事件指标，定位问题更直观。
- 中英双语界面：前端文案支持中英文切换，管理员页面交互风格统一（右上角图标操作按钮 + Tooltip）。
- 在线播放体验：播放器统一到 `Plyr` 能力层，支持字幕、倍速、画面模式、PiP、全屏与分片缓存播放。
- 字幕管理增强：支持字幕上传/删除与每条字幕偏移（±0.5 秒步进，自动保存到字幕表），播放中立即生效。
- 播放器交互优化：底栏支持“鼠标静止后自动隐藏、交互后自动显示”，行为与原版 Plyr 接近。
- 主题一致性：亮/暗色均使用统一语义色与中性色（`slate`），避免暗色页面出现突兀浅灰控件。
- 文案规范化：中英文功能命名更简洁，页面副标题/提示文案统一围绕“影视播放与检索”定位。

## 技术栈

- 后端：Go（GraphQL + REST）
- 前端：Next.js 16 + React 19 + Mantine 8 + ECharts
- 数据库：PostgreSQL
- 任务系统：内置队列 + worker
- 部署：Docker Compose / 本地脚本

## 快速开始

### 前置依赖

- Go（建议 1.23+）
- Node.js（建议 20+）与 npm
- PostgreSQL（本地或远程）
- Docker（可选，用于自动拉起本地 Postgres 或 Compose 部署）

### 本地开发（推荐）

1. 启动后端：

```bash
./startup.sh service
```

2. 启动后端 + 前端：

```bash
./startup.sh service --frontend
```

3. 热重载调试模式（后端）：

```bash
./startup.sh debug --frontend
```

默认地址：

- 后端 API：`http://localhost:3333`
- 前端开发服务：`http://localhost:3334`

说明：

- 根目录 `startup.sh` 会调用 `backend/startup.sh`，并可选带起 `frontend/startup.sh`。
- 后端脚本支持 `POSTGRES_AUTO_START=auto|1|0`。当数据库是本机地址且不可达时，`auto` 模式会尝试用 Docker 启动本地 Postgres 容器。
- 运行模式变量 `BITMAGNET_RUNTIME_MODE` 默认 `development`，用于隔离 `bm_key_values` 运行时配置（开发态优先使用 `dev:*`，缺失时回退无前缀；生产态使用无前缀 key）。

### Docker Compose

1. 使用内置 PostgreSQL 的样例编排：

```bash
docker compose -f docker-compose.sample.yml up -d --build
```

2. 使用当前默认编排（通常连接外部 PostgreSQL）：

```bash
docker compose up -d --build
```

默认访问地址：

- 后端 API：`http://localhost:3333`
- 前端：`http://localhost:3334`

模式建议：

- 本地开发：`BITMAGNET_RUNTIME_MODE=development`
- 线上环境：`BITMAGNET_RUNTIME_MODE=production`
- 说明：`docker-compose.sample.yml` 当前默认将 `BITMAGNET_RUNTIME_MODE` 设为 `production`，如需本地隔离配置请自行改为 `development`。

## 配置说明

### 后端常用环境变量

数据库：

- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_AUTO_START`（`auto|1|0`）

worker：

- `BITMAGNET_WORKER_KEYS`（默认 `all`，可指定部分 worker）
- `BITMAGNET_RUNTIME_MODE`（`development|production`，默认 `development`）
  - `development`：写入 `dev:*`；读取优先 `dev:*`，缺失时回退无前缀 key
  - `production`：读取/写入无前缀配置 key

日志：

- `LOG_LEVEL`
- `LOG_FILE_ROTATOR_LEVEL`
- `LOG_FILE_ROTATOR_MAX_SIZE`
- `LOG_FILE_ROTATOR_MAX_BACKUPS`

别名（会自动映射到上面的日志变量）：

- `BITMAGNET_LOG_LEVEL`
- `BITMAGNET_LOG_MAX_SIZE_MB`
- `BITMAGNET_LOG_MAX_BACKUPS`

### 前端常用环境变量

- `NEXT_PUBLIC_BITMAGNET_API_BASE_URL`
  - 配置后：浏览器直接请求该后端地址。
  - 不配置：前端通过 Next.js rewrite 代理到 `BITMAGNET_INTERNAL_API_BASE_URL`（默认 `http://localhost:3333`）。
- `BITMAGNET_INTERNAL_API_BASE_URL`
  - 前端服务端转发后端请求时使用（尤其在容器网络中）。

## 关键工作流

### 1) 封面缓存与回源

接口：

```text
/api/media/:id/cover/:kind/:size
```

- `kind`：`poster` 或 `backdrop`
- `size`：`sm|md|lg|xl`
- 缓存目录（默认）：`backend/data/cache/{mediaID}/`

行为：

- 已缓存：直接返回静态文件。
- 未缓存：提交队列任务并返回“加载中”临时封面。
- 无法匹配封面：返回“无封面”占位。

### 2) 队列清理

- 每天凌晨 `02:00` 自动清理 `processed + failed` 任务。
- 清理策略：
  - 超过最大保留天数的任务删除。
  - 总量超过最大保留条数时，按最旧优先删除。
- 页面可调参数路径：`队列管理 -> 右上角齿轮 -> 清理设置`。

### 3) 维护任务

- `/maintenance` 页面提交的任务会入队。
- 实际执行由 queue worker 完成。
- 页面展示的是队列任务状态与结果（不是本地临时任务状态）。

## 开发命令

根目录：

```bash
task test
task lint
task migrate
```

后端：

```bash
cd backend
go test ./...
task test
task lint
```

前端：

```bash
cd frontend
npm install
npm run dev
npm run typecheck
npm run lint
```

## 开发约定

- 播放器渲染链路以 Plyr 为主，不再维护 Video.js 旧路径。
- 提交前建议至少执行：`npm run lint`、`npm run typecheck`、`go test ./...`。

## 目录结构

- `backend/`：Go 服务、任务队列、数据库迁移、GraphQL/REST 接口
- `frontend/`：Next.js 前端页面与组件
- `docker-compose.yml`：默认编排
- `docker-compose.sample.yml`：带 PostgreSQL 的样例编排
- `startup.sh`：一键启动脚本（可同时拉起前后端）

## 说明

本仓库用于学习、开发和二次改造。请在使用爬取、索引、分发能力时遵守当地法律法规及站点规则。
