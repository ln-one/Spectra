# RQ 任务队列迁移指南

> 从 FastAPI BackgroundTasks 升级到 RQ (Redis Queue) 异步任务队列系统

## 概述

本指南说明如何将 Spectra 后端的异步任务处理从 FastAPI 内置的 `BackgroundTasks` 升级到基于 Redis 的 RQ 任务队列系统。

### 升级原因

**BackgroundTasks 的局限性**：
- ❌ 任务在内存中执行，服务重启会丢失
- ❌ 无法横向扩展（单进程处理）
- ❌ 缺乏任务重试机制
- ❌ 无法监控任务队列状态
- ❌ 任务失败后难以追踪和恢复

**RQ 的优势**：
- ✅ 任务持久化到 Redis，服务重启不丢失
- ✅ 支持多 Worker 并行处理，可横向扩展
- ✅ 内置重试机制和指数退避策略
- ✅ 完善的任务状态追踪和监控
- ✅ 支持任务优先级和超时控制

## 架构变化

### 升级前（BackgroundTasks）

```
Client → FastAPI → BackgroundTasks → 内存执行
                                    ↓
                                  完成/丢失
```

### 升级后（RQ）

```
Client → FastAPI → Redis Queue → Worker Pool → 执行任务
                      ↓              ↓
                   持久化        并行处理
                      ↓              ↓
                  状态追踪      自动重试
```

## 迁移步骤

### 1. 环境准备

#### 1.1 安装 Redis

**使用 Docker（推荐）**：
```bash
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

**使用 Docker Compose**：
```bash
docker-compose up -d redis
```

**验证 Redis 运行**：
```bash
redis-cli ping
# 应返回: PONG
```


#### 1.2 安装 Python 依赖

RQ 相关依赖已添加到 `backend/requirements.txt`：
```txt
redis==5.0.1
rq==1.15.1
fakeredis==2.20.1  # 用于测试
```

安装依赖：
```bash
cd backend
pip install -r requirements.txt
```

#### 1.3 配置环境变量

复制并编辑 `.env` 文件：
```bash
cp .env.example .env
```

添加 Redis 配置：
```bash
# Redis & Task Queue Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=  # 生产环境建议设置密码

# RQ 配置
RQ_QUEUE_DEFAULT_TIMEOUT=1800  # 30 分钟
RQ_RESULT_TTL=86400  # 结果保留 24 小时
RQ_FAILURE_TTL=604800  # 失败记录保留 7 天
```

### 2. 数据库迁移

#### 2.1 更新 Prisma Schema

已在 `GenerationTask` 模型中添加新字段：
```prisma
model GenerationTask {
  // ... 其他字段
  rqJobId     String?  // RQ Job ID
  retryCount  Int      @default(0)  // 重试次数
  
  @@index([rqJobId])
}
```

#### 2.2 执行数据库迁移

```bash
cd backend
prisma migrate dev --name add_rq_fields
prisma generate
```

### 3. 启动 Worker

#### 3.1 单个 Worker（开发环境）

```bash
cd backend
python worker.py
```

输出示例：
```
2024-01-15 10:00:00 - __main__ - INFO - Connecting to Redis at localhost:6379 (db=0)
2024-01-15 10:00:00 - __main__ - INFO - Redis connection successful
2024-01-15 10:00:00 - __main__ - INFO - Worker will listen to queues: ['high', 'default', 'low']
2024-01-15 10:00:00 - __main__ - INFO - Starting worker: rq:worker:hostname.12345
2024-01-15 10:00:00 - __main__ - INFO - Worker is ready to process tasks...
```

#### 3.2 多个 Worker（生产环境）

**方式 1：手动启动多个进程**
```bash
python worker.py &
python worker.py &
python worker.py &
```

**方式 2：使用 Docker Compose（推荐）**
```bash
# 启动 2 个 Worker（默认配置）
docker-compose up -d

# 扩展到 4 个 Worker
docker-compose up -d --scale worker=4

# 查看 Worker 日志
docker-compose logs -f worker
```

#### 3.3 优雅关闭 Worker

Worker 支持优雅关闭，会等待当前任务完成后退出：

```bash
# 发送 SIGTERM 信号
kill -TERM <worker_pid>

# 或使用 Ctrl+C (SIGINT)
```

### 4. 验证升级

#### 4.1 提交测试任务

使用 API 提交课件生成任务：
```bash
curl -X POST http://localhost:8000/api/v1/generate/courseware \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "test-project-id",
    "type": "pptx"
  }'
```

响应示例：
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "Task submitted successfully"
}
```

#### 4.2 查询任务状态

```bash
curl http://localhost:8000/api/v1/generate/tasks/{task_id}/status
```

响应示例：
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "progress": 50,
  "created_at": "2024-01-15T10:00:00Z"
}
```

#### 4.3 检查 Worker 日志

```bash
# 本地运行
# 查看终端输出

# Docker Compose
docker-compose logs -f worker
```

预期看到任务处理日志：
```
INFO - generation_task_processing_started - task_id=xxx
INFO - Calling AI service to generate courseware content
INFO - PPTX generated: /tmp/xxx.pptx
INFO - generation_task_completed - execution_time=120.5s
```


### 5. 测试关键场景

#### 5.1 服务重启测试

1. 提交一个任务
2. 立即重启 FastAPI 服务
3. 重新启动后查询任务状态
4. **预期结果**：任务状态仍然可查询，Worker 继续处理

#### 5.2 Worker 崩溃测试

1. 提交一个任务
2. 强制终止 Worker 进程（`kill -9`）
3. 重新启动 Worker
4. **预期结果**：任务重新入队并被处理

#### 5.3 重试机制测试

1. 模拟临时错误（如网络超时）
2. 观察任务自动重试
3. **预期结果**：任务最多重试 3 次，间隔为 1分钟、5分钟、15分钟

#### 5.4 并发测试

1. 同时提交 10 个任务
2. 启动 4 个 Worker
3. **预期结果**：任务被均匀分配到各个 Worker 并行处理

## API 兼容性

### 保持不变的接口

✅ **提交任务接口**：
```
POST /api/v1/generate/courseware
```
请求和响应格式完全不变。

✅ **查询状态接口**：
```
GET /api/v1/generate/tasks/{task_id}/status
```
响应格式完全不变。

✅ **下载文件接口**：
```
GET /api/v1/generate/tasks/{task_id}/download?file_type=ppt
```
完全不变。

### 前端无需修改

前端代码无需任何修改，可以继续使用现有的 API 调用逻辑。

## 监控和运维

### 队列监控

#### 方式 1：API 接口（如果实现）

```bash
curl http://localhost:8000/api/v1/admin/queue/stats
```

响应示例：
```json
{
  "queues": {
    "high": {"count": 0},
    "default": {"count": 5},
    "low": {"count": 2}
  },
  "workers": {
    "count": 4,
    "active": ["worker-1", "worker-2"]
  },
  "jobs": {
    "started": 2,
    "finished": 150,
    "failed": 3
  }
}
```

#### 方式 2：RQ Dashboard（可选）

安装并启动 RQ Dashboard：
```bash
pip install rq-dashboard
rq-dashboard --redis-host localhost --redis-port 6379
```

访问 http://localhost:9181 查看可视化监控界面。

### 日志管理

Worker 日志包含结构化信息：
```json
{
  "timestamp": "2024-01-15T10:00:00Z",
  "level": "INFO",
  "event": "generation_task_completed",
  "task_id": "xxx",
  "project_id": "yyy",
  "execution_time": 120.5,
  "output_urls": {"pptx": "..."}
}
```

建议配置日志聚合工具（如 ELK、Loki）收集和分析日志。

### 告警规则

建议配置以下告警：
- ⚠️ 队列积压超过 100 个任务
- ⚠️ Worker 全部离线
- ⚠️ 任务失败率超过 10%
- ⚠️ 任务平均执行时间超过 10 分钟

## 回滚方案

如果升级后出现问题，可以快速回滚：

### 1. 代码回滚

恢复 `backend/routers/generate.py` 使用 BackgroundTasks：

```python
# 回滚前（RQ）
job = task_queue_service.enqueue_generation_task(...)

# 回滚后（BackgroundTasks）
background_tasks.add_task(process_generation_task, ...)
```

### 2. 数据库回滚

```bash
cd backend
prisma migrate resolve --rolled-back add_rq_fields
```

### 3. 服务回滚

```bash
# 停止 Worker
docker-compose stop worker

# 停止 Redis（可选）
docker-compose stop redis

# 重启 FastAPI
docker-compose restart backend
```

### 4. 验证回滚

提交测试任务并验证功能正常。

## 生产环境部署

### Redis 配置

**高可用配置**：
- 使用 Redis Sentinel 或 Redis Cluster
- 启用 AOF + RDB 持久化
- 配置密码认证
- 配置主从复制

**示例配置**：
```bash
REDIS_HOST=redis-master.example.com
REDIS_PORT=6379
REDIS_PASSWORD=your-strong-password
```

### Worker 部署

**使用 Supervisor 管理 Worker**：

创建 `/etc/supervisor/conf.d/rq-worker.conf`：
```ini
[program:rq-worker]
command=/app/venv/bin/python /app/worker.py
directory=/app
user=www-data
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/rq-worker.log
environment=REDIS_HOST="redis.example.com",REDIS_PASSWORD="secret"
numprocs=4
process_name=%(program_name)s_%(process_num)02d
```

启动 Worker：
```bash
supervisorctl reread
supervisorctl update
supervisorctl start rq-worker:*
```

### 容量规划

**单 Worker 性能**：
- 平均任务执行时间：2-5 分钟
- 单 Worker 吞吐量：12-30 任务/小时

**推荐配置**：
- 小规模（<100 用户）：2-4 Worker
- 中规模（100-1000 用户）：4-8 Worker
- 大规模（>1000 用户）：8+ Worker

**Redis 资源**：
- 内存：每个任务约 1-5 KB
- 1000 个任务约需 1-5 MB
- 建议配置：至少 512 MB

## 常见问题

### Q1: Worker 无法连接到 Redis

**检查**：
```bash
# 测试 Redis 连接
redis-cli -h localhost -p 6379 ping

# 检查防火墙
telnet localhost 6379
```

**解决**：
- 确认 Redis 服务正在运行
- 检查 `REDIS_HOST` 和 `REDIS_PORT` 配置
- 检查网络和防火墙设置

### Q2: 任务一直处于 queued 状态

**原因**：没有 Worker 在运行

**解决**：
```bash
# 启动 Worker
python worker.py

# 或使用 Docker Compose
docker-compose up -d worker
```

### Q3: 任务失败后没有重试

**检查**：
- 查看 Worker 日志确认错误类型
- 不可重试错误（如参数错误）不会触发重试
- 可重试错误（如网络超时）会自动重试

### Q4: 如何清理失败的任务

```bash
# 使用 Redis CLI
redis-cli
> KEYS rq:job:*
> DEL rq:job:failed-job-id

# 或使用 RQ 命令
rq empty failed
```

### Q5: 如何监控 Worker 健康状态

```bash
# 查看 Worker 列表
rq info --url redis://localhost:6379

# 查看队列状态
rq info --url redis://localhost:6379 --queues high default low
```

## 总结

RQ 升级完成后，系统具备以下能力：

✅ **可靠性**：任务持久化，服务重启不丢失  
✅ **可恢复性**：Worker 崩溃后任务可重新处理  
✅ **可重试性**：自动重试机制和指数退避策略  
✅ **可扩展性**：支持多 Worker 并行处理  
✅ **可监控性**：完善的任务状态追踪和队列监控  
✅ **向后兼容**：API 接口保持不变，前端无需修改

如有问题，请参考：
- [Backend README](../../backend/README.md)
- [RQ 官方文档](https://python-rq.org/)
- [Redis 官方文档](https://redis.io/docs/)
