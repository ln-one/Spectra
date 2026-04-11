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
python3 ./scripts/compose_smart.py status
python3 ./scripts/compose_smart.py sync --channel develop
python3 ./scripts/compose_smart.py doctor
python3 ./scripts/compose_smart.py up
```

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

`Spectra` 默认使用锁定镜像启动 `Dualweave`、`Pagevra`、`Ourograph` 和 `Stratumind`。
如果你是对应服务的维护者，可以初始化 submodule，`python3 ./scripts/compose_smart.py`
会自动切换到本地源码构建。

现在推荐先跑：

```bash
python3 ./scripts/compose_smart.py status
```

它会明确告诉你每个私有服务当前是：

- `using locked image`
- `using local source`

然后显式同步当前通道的锁定镜像：

```bash
python3 ./scripts/compose_smart.py sync --channel develop
python3 ./scripts/compose_smart.py doctor
```

```bash
git submodule update --init --recursive
python3 ./scripts/compose_smart.py up --build
```

如果没有 `Pagevra` / `Dualweave` / `Ourograph` / `Stratumind` 源码仓权限，也不需要改 compose；
只要对应镜像已经发布且可匿名拉取，`sync` 就会把锁定组合写入 `.env.compose.lock`。

如果某个服务的共享镜像还没发布，或者 GHCR package 仍然是私有的，`sync` / `doctor`
会直接失败并指出具体服务，而不会偷偷退回到浮动 tag。

当前默认策略：

- `Pagevra`: `develop -> dev`，`main -> latest`
- `Dualweave`: `develop -> dev`，`main -> latest`
- `Ourograph`: `develop -> dev`，`main -> latest`
- `Stratumind`: `develop -> dev`，`main -> latest`
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
