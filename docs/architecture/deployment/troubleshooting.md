# Troubleshooting Guide

## 常见问题

### 1. Docker 容器无法启动

**问题**: `docker-compose up` 失败

**解决方案**:

```bash
# 查看日志
docker-compose logs

# 清理并重新构建
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### 2. 数据库连接失败

**问题**: Prisma Client 无法连接数据库

**解决方案**:

```bash
# 检查 PostgreSQL 容器与健康状态
docker-compose ps postgres
docker-compose logs postgres --tail=50

# 重新生成 Prisma Client 并应用 fresh baseline
cd backend
prisma generate
prisma migrate deploy
```

### 3. 前端无法连接后端

**问题**: API 请求失败 (CORS 错误)

**解决方案**:

```bash
# 检查环境变量
cat frontend/.env.local

# 确保 NEXT_PUBLIC_API_URL 正确
# 确保后端 CORS_ORIGINS 包含前端地址
```

补充：

- 浏览器端请求默认应直连 `NEXT_PUBLIC_API_URL`
- 如果聊天请求很慢，避免把 Next.js `/api/v1` rewrite 当成唯一承载路径

### 4. 文件上传失败

**问题**: 上传文件后返回 500 错误

**解决方案**:

```bash
# 检查上传目录权限
ls -la backend/uploads

# 创建上传目录
mkdir -p backend/uploads
chmod 755 backend/uploads
```

### 5. AI 生成失败

**问题**: 课件生成任务一直处于 pending 状态

**解决方案**:

```bash
# 检查 API Key
echo $DASHSCOPE_API_KEY

# 查看后端日志
docker-compose logs backend

# 测试 API 连接
curl -X POST https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation \
 -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
 -H "Content-Type: application/json" \
 -d '{"model":"qwen3.5-plus","input":{"messages":[{"role":"user","content":"test"}]}}'
```

### 6. JWT 认证失败

**问题**: 登录后仍然返回 401 错误

**解决方案**:

```bash
# 检查 JWT_SECRET_KEY 是否配置
echo $JWT_SECRET_KEY

# 检查 Token 是否正确存储
# 前端: localStorage.getItem('access_token')

# 检查 Token 格式
# Header: Authorization: Bearer {token}
```

### 7. API 504 Gateway Timeout

**问题**: 点击生成课件后，经过 60 秒返回 504 错误。
**原因**: Nginx 或 Uvicorn 默认超时时间过短，无法满足长耗时的 AI 生成任务。
**解决方案**:

- Nginx 增加 `proxy_read_timeout 300s;`
- Uvicorn 启动参数增加 `--timeout-keep-alive 300`

### 8. Stratumind / Qdrant Dimension Mismatch

**问题**: 检索时报错 `Vector dimension mismatch`。
**原因**: 更改了 Embedding 模型或维度，但未重建 `Stratumind` 写入到 `Qdrant` 的旧索引。
**解决方案**:

- 清空对应 `Qdrant` collection 或删除项目索引后重新入库。
- 确认 `STRATUMIND_EMBEDDING_DIMENSION` 与实际 provider 返回维度一致。

## 性能问题

### 1. API 响应慢

**排查步骤**:

1. 检查数据库查询性能
2. 检查是否有 N+1 查询
3. 添加数据库索引
4. 启用 Redis 缓存

### 2. 文件上传慢

**排查步骤**:

1. 检查网络带宽
2. 检查文件大小限制
3. 启用分片上传
4. 使用 CDN 加速

## 日志查看

```bash
# Docker 日志
docker-compose logs -f backend
docker-compose logs -f frontend

# 应用日志
tail -f backend/logs/app.log
tail -f backend/logs/error.log
```

## 相关文档

- [Local Development](./local-development.md) - 本地开发
- [Production Deployment](./production-deployment.md) - 生产部署
