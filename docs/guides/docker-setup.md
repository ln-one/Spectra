# Docker 开发环境配置指南

## 前置要求

### Mac 用户
```bash
# 安装 Docker Desktop
brew install --cask docker
```

### Windows 用户
1. 下载 Docker Desktop: https://www.docker.com/products/docker-desktop
2. 安装并启动 Docker Desktop
3. 确保启用 WSL 2 支持

## 快速启动

### 1. 启动所有服务
```bash
python3 ./scripts/compose_smart.py up
```

现在日常开发默认直接用这一条就行：

- 如果 `.env.compose.lock` 缺失或和当前 stack lock 不一致，`up` 会自动先做 `sync`
- 如果检测到本地私有服务源码，`up` 会自动加 `--build`
- 所以大多数情况下不再需要手动记 `sync --channel develop` 和 `up --build`

前端: http://localhost:3000
后端: http://localhost:8000
Swagger UI: http://localhost:8000/docs
ReDoc: http://localhost:8000/redoc

### 2. 后台运行
```bash
python3 ./scripts/compose_smart.py up -d
```

### 3. 查看日志
```bash
python3 ./scripts/compose_smart.py logs -f
```

### 4. 停止服务
```bash
python3 ./scripts/compose_smart.py down
```

## 维护者源码模式

`Spectra` 默认使用锁定镜像启动 `Dualweave`、`Pagevra`、`Ourograph`、`Stratumind` 和 `Diego`。
如果你是对应服务的维护者，可以初始化 submodule，`python3 ./scripts/compose_smart.py`
会自动切换到本地源码构建。

`sync` 现在还会生成仓库级 [docker-compose.override.yml](/Users/ln1/Projects/Spectra/docker-compose.override.yml)，
让裸 `docker compose up` 也能跟随当前本地源码模式；不再需要手动拼 `-f docker-compose.*.dev.yml`。

如果你想先看当前模式，推荐先跑：

```bash
python3 ./scripts/compose_smart.py status
```

它会明确告诉你每个私有服务当前是：

- `using locked image`
- `using local source`

如果你想手动预热镜像或排查 compose 状态，仍然可以显式执行：

```bash
python3 ./scripts/compose_smart.py sync --channel develop
python3 ./scripts/compose_smart.py doctor
```

如果你更习惯直接用 Docker Compose，也可以在 `sync` 之后运行：

```bash
docker compose up
```

前提是先跑过 `sync`，让 `.env` / `.env.compose.lock` 和 `docker-compose.override.yml` 都更新到当前状态。

```bash
git submodule update --init --recursive
python3 ./scripts/compose_smart.py up
```

如果没有 `Pagevra` / `Dualweave` / `Ourograph` / `Stratumind` / `Diego` 源码仓权限，也不需要改 compose；
只要对应镜像已经发布且可匿名拉取，`sync` 就会把锁定组合写入 `.env.compose.lock`。

如果某个服务的共享镜像还没发布，或者 GHCR package 仍然是私有的，`sync` / `doctor`
会直接失败并指出具体服务，而不会偷偷退回到浮动 tag。

当前默认策略：

- `Pagevra`: `develop -> dev`，`main -> latest`
- `Dualweave`: `develop -> dev`，`main -> latest`
- `Ourograph`: `develop -> dev`，`main -> latest`
- `Stratumind`: `develop -> dev`，`main -> latest`
- `Diego`: `develop -> dev`，`main -> latest`（当前为 source-mode 引导锁，待发布 digest）
- Spectra 自己通过 `infra/stack-lock.<channel>.json` 决定“当前兼容的整套私有服务组合”

## 常用命令

### 重新构建镜像
```bash
python3 ./scripts/compose_smart.py build
```

### 只启动前端
```bash
python3 ./scripts/compose_smart.py up frontend
```

### 只启动后端
```bash
python3 ./scripts/compose_smart.py up backend
```

### 进入容器
```bash
# 进入后端容器
python3 ./scripts/compose_smart.py exec backend bash

# 进入前端容器
python3 ./scripts/compose_smart.py exec frontend sh
```

### 清理所有容器和镜像
```bash
python3 ./scripts/compose_smart.py down -v
docker system prune -a
```

## 数据库操作

### 初始化数据库
```bash
python3 ./scripts/compose_smart.py exec backend prisma db push
```

### 查看数据库
```bash
python3 ./scripts/compose_smart.py exec backend prisma studio
```

## 故障排查

### 端口被占用
```bash
# Mac/Linux
lsof -i :3000
lsof -i :8000

# Windows
netstat -ano | findstr :3000
netstat -ano | findstr :8000
```

### 清理缓存重新构建
```bash
python3 ./scripts/compose_smart.py down -v
python3 ./scripts/compose_smart.py build --no-cache
python3 ./scripts/compose_smart.py up
```

### 依赖更新后重新构建
```bash
# 前端依赖更新
python3 ./scripts/compose_smart.py build frontend

# 后端依赖更新
python3 ./scripts/compose_smart.py build backend
```

兼容说明：

- `scripts/compose-smart.sh` 仍然保留，但现在只是转发到 Python 入口
- Windows 用户可以直接运行 `python scripts/compose_smart.py ...`

## 优势

1. **跨平台一致性**: Mac、Windows、Linux 环境完全相同
2. **快速入职**: 新人一条命令启动项目
3. **隔离环境**: 不污染本地环境
4. **CI/CD 一致**: 本地开发 = CI 环境 = 生产环境
