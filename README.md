# bitmagnet（比特磁铁） (custom full-stack workspace)

这是一个包含后端（Go）与前端（Next.js + Mantine）的 bitmagnet 改造版工作区。

## 快速开始

### 本地开发（推荐）

1. 只启动后端：

```bash
./startup.sh service
```

2. 同时启动后端 + 前端：

```bash
./startup.sh service --frontend
```

默认端口：
- 后端 API: `http://localhost:3333`
- 前端开发服务: `http://localhost:3334`

### Docker Compose

`docker-compose.yml` 仅保留最小服务集：
- `postgres`（数据库）
- `bitmagnet`（后端 API）
- `frontend`（Next.js 前端）

启动全部服务：

```bash
docker compose up -d
```

默认访问地址：
- 后端 API: `http://localhost:3333`
- 前端（compose）: `http://localhost:3334`

## 前端环境变量

前端通过 `NEXT_PUBLIC_BITMAGNET_API_BASE_URL` 指向后端地址，例如：

```bash
NEXT_PUBLIC_BITMAGNET_API_BASE_URL=http://localhost:3333
```

## 封面缓存（后端）

后端提供封面缓存与多尺寸切图，缓存目录默认为：

```bash
backend/data/cache/{mediaid}/
```

封面调用格式：

```text
/api/media/:id/cover/:kind/:size
```

- `kind`: `poster` 或 `backdrop`
- `size`: `sm` / `md` / `lg` / `xl`

## 目录

- `backend/`：Go 服务与迁移
- `frontend/`：Next.js 前端
- `docker-compose.yml`：最小化容器编排（postgres + bitmagnet + frontend）
