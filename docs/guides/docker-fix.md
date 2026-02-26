# Docker 依赖更新指南

## 问题：后端缺少依赖

当你看到类似错误：
```
ImportError: email-validator is not installed
```

## 快速修复（3 种方法）

### 方法 1：重新构建镜像（推荐）

```bash
# 停止容器
docker-compose down

# 重新构建并启动
docker-compose up --build

# 或者只重建后端
docker-compose up --build backend
```

### 方法 2：进入容器手动安装

```bash
# 查看运行中的容器
docker ps

# 进入后端容器
docker-compose exec backend bash

# 安装缺失的依赖
pip install email-validator

# 退出容器
exit

# 重启容器
docker-compose restart backend
```

### 方法 3：清理并重建（彻底）

```bash
# 停止并删除容器、网络、卷
docker-compose down -v

# 删除旧镜像
docker rmi spectra-backend spectra-frontend

# 重新构建
docker-compose up --build
```

## 前端 Next.js 警告修复

如果看到：
```
Failed to patch lockfile, please try uninstalling and reinstalling next
```

这是 Next.js 的已知问题，不影响运行，可以忽略，参考：https://github.com/vercel/next.js/issues

如果想修复：

```bash
# 进入前端容器
docker-compose exec frontend sh

# 删除 node_modules 和 lockfile
rm -rf node_modules package-lock.json

# 重新安装
npm install

# 退出
exit

# 重启
docker-compose restart frontend
```

## 验证修复

```bash
# 检查后端日志
docker-compose logs backend

# 应该看到：
# INFO:     Uvicorn running on http://0.0.0.0:8000

# 检查前端日志
docker-compose logs frontend

# 应该看到：
# ✓ Ready in XXXXms

# 测试后端 API
curl http://localhost:8000/docs

# 测试前端
open http://localhost:3000
```

## 常见问题

### Q: 为什么需要重新构建？

A: Docker 镜像是分层的，当 `requirements.txt` 更新后，需要重新构建镜像才能安装新依赖。

### Q: `--build` 会很慢吗？

A: 不会。Docker 会使用缓存，只重新构建变化的层。通常 1-2 分钟。

### Q: 可以只更新依赖不重启吗？

A: 可以用方法 2 进入容器手动安装，但重启后会丢失。生产环境必须用方法 1。

## 预防措施

每次更新 `requirements.txt` 或 `package.json` 后：

```bash
# 自动重新构建
docker-compose up --build
```

或者在 `docker-compose.yml` 中添加：

```yaml
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    # 添加这行，每次启动都检查依赖
    command: sh -c "pip install -r requirements.txt && uvicorn main:app --host 0.0.0.0 --reload"
```
