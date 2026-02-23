# Deployment Architecture

> 本文档为部署架构索引，详细内容已拆分到各子文档。

## 快速导航

### 开发与部署
- [Local Development](./deployment/local-development.md) - 本地开发环境配置
- [Environment Variables](./deployment/environment-variables.md) - 环境变量配置（含 JWT_SECRET_KEY）
- [Production Deployment](./deployment/production-deployment.md) - 生产环境部署

### 运维与维护
- [Troubleshooting](./deployment/troubleshooting.md) - 故障排查指南

## 部署目标

1. **本地开发环境** - 支持快速启动和热重载
2. **演示环境** - 支持竞赛现场或云端演示
3. **生产环境** - 预留可扩展的生产部署方案

## 架构原则

- **容器化优先** - 使用 Docker 确保环境一致性
- **配置分离** - 通过环境变量管理不同环境配置
- **数据持久化** - 确保数据库和文件存储的持久性
- **服务解耦** - 前后端独立部署和扩展
- **安全第一** - JWT 认证、密钥管理、数据加密

## 快速开始

### Docker Compose 启动

```bash
# 1. 克隆项目
git clone <repository-url>
cd spectra

# 2. 配置环境变量
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

# 重要：设置 JWT_SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(32))"
# 将生成的密钥添加到 backend/.env

# 3. 启动所有服务
docker-compose up -d

# 4. 访问应用
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
```

## 环境对比

| 特性 | 开发环境 | 演示环境 | 生产环境 |
|------|---------|---------|---------|
| 数据库 | SQLite | SQLite | PostgreSQL |
| 文件存储 | 本地 | 本地 | OSS/S3 |
| 缓存 | 无 | 无 | Redis |
| 认证 | JWT | JWT | JWT + 刷新 |
| HTTPS | 否 | 可选 | 必须 |
| 监控 | 否 | 否 | 是 |

## 关键配置

### JWT 认证配置

```bash
# backend/.env
JWT_SECRET_KEY="your-super-secret-key"
JWT_ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7  # 新增：确保长效会话稳定性
```
### 向量数据库配置

```bash
# backend/.env
CHROMA_MODE="persistent" # 开发/演示环境：本地持久化
# CHROMA_MODE="http"     # 生产环境：连接独立服务
```

### CORS 配置

```bash
# backend/.env
CORS_ORIGINS="http://localhost:3000,https://your-domain.com"
```

### API Keys

```bash
# backend/.env
DASHSCOPE_API_KEY="sk-your-dashscope-api-key"
LLAMAPARSE_API_KEY="llx-your-llamaparse-api-key"
```

## 部署检查清单

### 开发环境
- [ ] Docker Desktop 已安装
- [ ] 环境变量已配置
- [ ] JWT_SECRET_KEY 已设置
- [ ] API Keys 已配置
- [ ] 服务启动成功

### 生产环境
- [ ] PostgreSQL 已部署
- [ ] Redis 已部署
- [ ] OSS/S3 已配置
- [ ] SSL 证书已配置
- [ ] JWT_SECRET_KEY 已更换为生产密钥
- [ ] 监控系统已部署
- [ ] 备份策略已实施
