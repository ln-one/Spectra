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
docker-compose up
```

前端: http://localhost:3000
后端: http://localhost:8000
Swagger UI: http://localhost:8000/docs
ReDoc: http://localhost:8000/redoc

### 2. 后台运行
```bash
docker-compose up -d
```

### 3. 查看日志
```bash
docker-compose logs -f
```

### 4. 停止服务
```bash
docker-compose down
```

## 常用命令

### 重新构建镜像
```bash
docker-compose build
```

### 只启动前端
```bash
docker-compose up frontend
```

### 只启动后端
```bash
docker-compose up backend
```

### 进入容器
```bash
# 进入后端容器
docker-compose exec backend bash

# 进入前端容器
docker-compose exec frontend sh
```

### 清理所有容器和镜像
```bash
docker-compose down -v
docker system prune -a
```

## 数据库操作

### 初始化数据库
```bash
docker-compose exec backend prisma db push
```

### 查看数据库
```bash
docker-compose exec backend prisma studio
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
docker-compose down -v
docker-compose build --no-cache
docker-compose up
```

### 依赖更新后重新构建
```bash
# 前端依赖更新
docker-compose build frontend

# 后端依赖更新
docker-compose build backend
```

## 优势

1. **跨平台一致性**: Mac、Windows、Linux 环境完全相同
2. **快速入职**: 新人一条命令启动项目
3. **隔离环境**: 不污染本地环境
4. **CI/CD 一致**: 本地开发 = CI 环境 = 生产环境
