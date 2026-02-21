# ADR-011: 关键架构问题分析

## 状态
**严重警告 (Critical)** - 2026-02-21

## 背景

本文档识别 Spectra 项目中**如果现在不解决，后续改造成本极高**的架构问题。这些问题不是功能缺失，而是架构设计的根本性缺陷。

## 关键架构问题清单

### 🔴 P0 级别 - 必须立即解决

#### 1. 用户数据隔离缺失 ⚠️

**问题描述**：
- 数据模型完全没有用户维度
- 无认证机制，任何人可访问任何数据
- 无法实现多租户

**后续改造成本**：
- 数据库 Schema 全面重构
- 所有 API 接口改造
- 前端认证流程重写
- 现有数据迁移困难
- **预计工时：10-16 天**

**解决方案**：见 ADR-010

---

#### 2. 向量数据库无用户隔离 ⚠️

**问题描述**：
```text
# 当前实现
self.collection.add(
    documents=documents,
    metadatas=[{"project_id": project_id}]  # ❌ 缺少 user_id
)

# 检索时
results = self.collection.query(
    where={"project_id": project_id}  # ❌ 任何人都能检索任何项目
)
```

**安全风险**：
- 用户 A 可以检索到用户 B 的私有教学资料
- 敏感教学内容泄露
- 无法实现数据隔离

**后续改造成本**：
- ChromaDB 数据需要重新索引
- 所有 RAG 检索逻辑需要改造
- 现有向量数据无法迁移（缺少 user_id）
- **预计工时：3-5 天**

**解决方案**：
```python
# 正确实现
self.collection.add(
    documents=documents,
    metadatas=[{
        "project_id": project_id,
        "user_id": user_id  # ✅ 添加用户隔离
    }]
)

# 检索时强制过滤
results = self.collection.query(
    where={
        "project_id": project_id,
        "user_id": user_id  # ✅ 用户隔离
    }
)
```

---

#### 3. 文件存储无权限控制 ⚠️

**问题描述**：
```python
# 当前实现
@router.get("/uploads/{filename}")
async def download_file(filename: str):
    return FileResponse(f"./uploads/{filename}")  # ❌ 任何人都能下载
```

**安全风险**：
- 文件路径可被枚举
- 任何人都能下载其他用户的文件
- 敏感教学资料泄露

**后续改造成本**：
- 文件存储结构需要重新设计
- 需要实现文件访问权限检查
- 现有文件需要重新组织目录结构
- **预计工时：2-3 天**

**解决方案**：
```python
# 正确实现
@router.get("/uploads/{file_id}")
async def download_file(
    file_id: str,
    user_id: str = Depends(get_current_user)
):
    # 1. 查询文件记录
    file = await db_service.get_upload(file_id)
    if not file:
        raise HTTPException(404, "文件不存在")
    
    # 2. 权限检查
    project = await db_service.get_project(file.projectId)
    if project.userId != user_id:
        raise HTTPException(403, "无权访问此文件")
    
    # 3. 返回文件
    return FileResponse(file.filepath)
```

---

### 🟠 P1 级别 - 近期必须解决

#### 4. 缺少 API 幂等性设计 ⚠️

**问题描述**：
```python
# 当前实现
@router.post("/generate/courseware")
async def create_generation_task(request: GenerateRequest):
    task = await db_service.create_generation_task(...)  # ❌ 重复请求会创建多个任务
    return {"task_id": task.id}
```

**业务风险**：
- 网络抖动导致重复提交
- 用户多次点击生成按钮
- 浪费 AI API 配额
- 产生重复费用

**后续改造成本**：
- 需要引入幂等性机制（如 Redis）
- 所有写操作接口需要改造
- **预计工时：3-4 天**

**解决方案**：
```python
# 正确实现
@router.post("/generate/courseware")
async def create_generation_task(
    request: GenerateRequest,
    idempotency_key: str = Header(None)
):
    # 1. 检查幂等性
    if idempotency_key:
        cached_task = await cache_service.get(f"idempotency:{idempotency_key}")
        if cached_task:
            return cached_task
    
    # 2. 创建任务
    task = await db_service.create_generation_task(...)
    
    # 3. 缓存结果
    if idempotency_key:
        await cache_service.set(
            f"idempotency:{idempotency_key}",
            {"task_id": task.id},
            ttl=3600
        )
    
    return {"task_id": task.id}
```

---

#### 5. 缺少分布式锁机制 ⚠️

**问题描述**：
```python
# 当前实现
async def process_generation_task(task_id: str):
    task = await db_service.get_generation_task(task_id)
    if task.status == "pending":  # ❌ 并发场景下会重复处理
        await db_service.update_task_status(task_id, "processing")
        # ... 处理任务
```

**并发风险**：
- 多个 worker 同时处理同一任务
- 浪费计算资源
- 可能产生数据不一致

**后续改造成本**：
- 需要引入 Redis 分布式锁
- 所有异步任务处理逻辑需要改造
- **预计工时：2-3 天**

**解决方案**：
```python
# 正确实现
async def process_generation_task(task_id: str):
    # 1. 获取分布式锁
    lock_key = f"task_lock:{task_id}"
    async with redis_lock(lock_key, timeout=600):
        # 2. 再次检查状态
        task = await db_service.get_generation_task(task_id)
        if task.status != "pending":
            return
        
        # 3. 更新状态
        await db_service.update_task_status(task_id, "processing")
        
        # 4. 处理任务
        # ...
```

---

#### 6. 缺少 API 限流机制 ⚠️

**问题描述**：
- 无任何限流保护
- 恶意用户可以无限调用 API
- AI API 配额可能被耗尽

**业务风险**：
- API 费用失控
- 服务被 DDoS 攻击
- 正常用户无法使用

**后续改造成本**：
- 需要引入限流中间件
- 需要 Redis 存储限流计数
- **预计工时：2-3 天**

**解决方案**：
```python
# 使用 slowapi
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# 应用限流
@router.post("/generate/courseware")
@limiter.limit("5/minute")  # 每分钟最多 5 次
async def create_generation_task(request: Request, ...):
    pass
```

---

#### 7. 缺少数据库事务管理 ⚠️

**问题描述**：
```python
# 当前实现
async def create_project_with_files(data: CreateProjectData):
    # 1. 创建项目
    project = await db_service.create_project(data)
    
    # 2. 上传文件
    for file in data.files:
        await db_service.create_upload(project.id, file)  # ❌ 如果失败，项目已创建
    
    return project
```

**数据一致性风险**：
- 部分操作失败导致数据不一致
- 无法回滚
- 产生孤儿数据

**后续改造成本**：
- 需要引入事务管理
- 所有复合操作需要改造
- **预计工时：3-4 天**

**解决方案**：
```python
# 正确实现（Prisma 支持事务）
async def create_project_with_files(data: CreateProjectData):
    async with prisma.tx() as transaction:
        # 1. 创建项目
        project = await transaction.project.create(data)
        
        # 2. 上传文件
        for file in data.files:
            await transaction.upload.create({
                "projectId": project.id,
                "filename": file.filename,
                # ...
            })
        
        # 3. 自动提交或回滚
        return project
```

---

### 🟡 P2 级别 - 中期需要解决

#### 8. 缺少统一错误处理机制

**问题描述**：
- 错误处理分散在各个 router
- 错误信息不统一
- 缺少错误码体系

**后续改造成本**：
- 需要定义错误码规范
- 所有接口需要统一改造
- **预计工时：2-3 天**

**解决方案**：
```python
# 定义错误码
class ErrorCode(str, Enum):
    USER_NOT_FOUND = "USER_NOT_FOUND"
    PROJECT_NOT_FOUND = "PROJECT_NOT_FOUND"
    INSUFFICIENT_QUOTA = "INSUFFICIENT_QUOTA"
    # ...

# 自定义异常
class BusinessException(Exception):
    def __init__(self, code: ErrorCode, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code

# 全局异常处理
@app.exception_handler(BusinessException)
async def business_exception_handler(request: Request, exc: BusinessException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": exc.code,
                "message": exc.message
            }
        }
    )
```

---

#### 9. 缺少结构化日志

**问题描述**：
```python
# 当前实现
logger.info(f"User {user_id} created project {project_id}")  # ❌ 难以查询和分析
```

**运维风险**：
- 日志难以检索
- 无法做数据分析
- 问题排查困难

**后续改造成本**：
- 需要引入结构化日志库
- 所有日志语句需要改造
- **预计工时：2-3 天**

**解决方案**：
```python
# 使用 structlog
import structlog

logger = structlog.get_logger()

# 结构化日志
logger.info(
    "project_created",
    user_id=user_id,
    project_id=project_id,
    project_name=project.name,
    timestamp=datetime.utcnow().isoformat()
)
```

---

#### 10. 缺少配额管理系统

**问题描述**：
- 无法限制用户使用量
- AI API 费用无法控制
- 无法实现付费功能

**业务风险**：
- 成本失控
- 无法商业化
- 资源被滥用

**后续改造成本**：
- 需要设计配额系统
- 需要在所有消耗资源的地方检查配额
- **预计工时：5-7 天**

**解决方案**：
```python
# 配额模型
model UserQuota {
  id              String   @id @default(uuid())
  userId          String   @unique
  
  // 配额限制
  maxProjects     Int      @default(10)
  maxFilesPerProject Int   @default(50)
  maxGenerationsPerDay Int @default(20)
  maxStorageBytes BigInt   @default(1073741824)  // 1GB
  
  // 当前使用量
  currentProjects Int      @default(0)
  currentStorage  BigInt   @default(0)
  generationsToday Int     @default(0)
  lastResetDate   DateTime @default(now())
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

# 配额检查中间件
async def check_quota(
    user_id: str,
    quota_type: str,
    amount: int = 1
):
    quota = await db_service.get_user_quota(user_id)
    
    if quota_type == "generation":
        if quota.generationsToday >= quota.maxGenerationsPerDay:
            raise BusinessException(
                ErrorCode.QUOTA_EXCEEDED,
                "今日生成次数已用完"
            )
        await db_service.increment_quota(user_id, "generationsToday", amount)
```

---

#### 11. 缺少审计日志

**问题描述**：
- 无法追踪用户操作
- 无法审计数据变更
- 安全事件无法溯源

**合规风险**：
- 无法满足数据保护法规
- 安全事件无法调查
- 用户纠纷无法举证

**后续改造成本**：
- 需要设计审计日志系统
- 所有关键操作需要记录
- **预计工时：3-4 天**

**解决方案**：
```python
# 审计日志模型
model AuditLog {
  id          String   @id @default(uuid())
  userId      String
  action      String   // CREATE_PROJECT, DELETE_FILE, GENERATE_COURSEWARE
  resourceType String  // project, file, task
  resourceId  String
  changes     String?  // JSON: 变更前后的数据
  ipAddress   String?
  userAgent   String?
  createdAt   DateTime @default(now())
  
  @@index([userId, createdAt])
  @@index([resourceType, resourceId])
}

# 审计日志装饰器
def audit_log(action: str, resource_type: str):
    def decorator(func):
        async def wrapper(*args, **kwargs):
            result = await func(*args, **kwargs)
            
            # 记录审计日志
            await db_service.create_audit_log(
                user_id=kwargs.get("user_id"),
                action=action,
                resource_type=resource_type,
                resource_id=result.id,
                # ...
            )
            
            return result
        return wrapper
    return decorator
```

---

#### 12. 缺少数据备份策略

**问题描述**：
- 无自动备份机制
- 数据丢失无法恢复
- 无灾难恢复计划

**业务风险**：
- 数据丢失导致用户流失
- 无法满足 SLA
- 法律责任

**后续改造成本**：
- 需要设计备份系统
- 需要实现自动备份脚本
- 需要测试恢复流程
- **预计工时：3-5 天**

**解决方案**：
```bash
# 自动备份脚本
#!/bin/bash
# backup-cron.sh

# 1. 数据库备份
pg_dump -U user spectra | gzip > /backup/db-$(date +%Y%m%d-%H%M%S).sql.gz

# 2. 文件备份
tar -czf /backup/uploads-$(date +%Y%m%d-%H%M%S).tar.gz /app/uploads

# 3. 向量数据库备份
tar -czf /backup/chroma-$(date +%Y%m%d-%H%M%S).tar.gz /app/chroma_data

# 4. 上传到对象存储
aws s3 sync /backup s3://spectra-backup/

# 5. 清理本地旧备份
find /backup -mtime +7 -delete

# 6. 验证备份完整性
# ...
```

---

## 优先级矩阵

| 问题 | 改造成本 | 业务影响 | 优先级 | 建议时间 |
|------|---------|---------|--------|---------|
| 1. 用户数据隔离 | 极高 | 极高 | P0 | 立即 |
| 2. 向量数据库隔离 | 高 | 极高 | P0 | 立即 |
| 3. 文件权限控制 | 中 | 高 | P0 | 立即 |
| 4. API 幂等性 | 中 | 中 | P1 | 1 周内 |
| 5. 分布式锁 | 中 | 中 | P1 | 1 周内 |
| 6. API 限流 | 低 | 高 | P1 | 2 周内 |
| 7. 事务管理 | 中 | 中 | P1 | 2 周内 |
| 8. 错误处理 | 低 | 低 | P2 | 1 个月内 |
| 9. 结构化日志 | 低 | 低 | P2 | 1 个月内 |
| 10. 配额管理 | 高 | 中 | P2 | 2 个月内 |
| 11. 审计日志 | 中 | 中 | P2 | 2 个月内 |
| 12. 备份策略 | 中 | 高 | P2 | 1 个月内 |

## 总改造成本估算

- **P0 级别**：15-24 天
- **P1 级别**：10-14 天
- **P2 级别**：15-22 天
- **总计**：40-60 天

## 建议实施路径

### Phase 1: 安全基础（P0，2-3 周）
1. 实现用户认证系统
2. 改造数据模型添加用户隔离
3. 实现文件访问权限控制
4. 改造向量数据库添加用户过滤

### Phase 2: 稳定性增强（P1，2 周）
1. 实现 API 幂等性
2. 添加分布式锁
3. 实现 API 限流
4. 添加事务管理

### Phase 3: 可运维性（P2，3-4 周）
1. 统一错误处理
2. 结构化日志
3. 配额管理系统
4. 审计日志
5. 自动备份

## 风险评估

### 如果不解决的后果

**P0 问题不解决**：
- ❌ 无法上线生产环境
- ❌ 严重安全漏洞
- ❌ 无法通过安全审计
- ❌ 法律风险

**P1 问题不解决**：
- ⚠️ 并发场景下数据不一致
- ⚠️ 资源被滥用
- ⚠️ 成本失控
- ⚠️ 用户体验差

**P2 问题不解决**：
- ⚠️ 运维困难
- ⚠️ 问题排查困难
- ⚠️ 无法商业化
- ⚠️ 数据丢失风险

## 相关决策

- ADR-010: 用户数据隔离设计
- ADR-001: 技术栈选型
- ADR-003: 数据库设计
