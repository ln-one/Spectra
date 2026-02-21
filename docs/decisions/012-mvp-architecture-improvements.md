# ADR-012: MVP 架构改进建议

## 状态
**提议中 (Proposed)** - 2026-02-21

## 背景

Spectra 项目目前处于架构设计阶段，**尚未开始实际开发**。本文档基于现有架构文档分析，提出在 MVP 开发前必须纳入的架构改进，避免后续高成本返工。

## 核心原则

**在 MVP 阶段就做对的事情**：
- ✅ 简单但正确的设计
- ✅ 预留扩展空间
- ❌ 不过度设计
- ❌ 不留架构债务

## MVP 架构必须包含的设计

### 1. 用户认证与数据隔离（必须）

#### 为什么必须在 MVP 就做

**如果不做**：
- 后续需要重构所有数据表
- 所有 API 接口需要改造
- 现有数据无法迁移
- 改造成本：10-16 天

**MVP 实现方案（简化版）**：

```prisma
// 最小化用户模型
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String   // bcrypt 哈希
  username  String
  
  projects  Project[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// 所有核心表添加 userId
model Project {
  id          String   @id @default(uuid())
  userId      String   // ✅ 必须有
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  name        String
  // ... 其他字段
  
  @@index([userId, createdAt])
}
```
# 使用 JWT，不需要 Redis
from jose import jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"])

def create_token(user_id: str) -> str:
    return jwt.encode(
        {"sub": user_id, "exp": datetime.utcnow() + timedelta(days=7)},
        SECRET_KEY,
        algorithm="HS256"
    )

def verify_token(token: str) -> str:
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    return payload["sub"]
```

**工作量**：2-3 天（MVP 阶段）vs 10-16 天（后续改造）

---

### 2. 向量数据库用户隔离（必须）

#### 为什么必须在 MVP 就做

**如果不做**：
- 用户 A 能检索到用户 B 的私有资料
- 向量数据需要全部重新索引
- 改造成本：3-5 天

**MVP 实现方案**：

```python
# 在索引时就加上 user_id
async def add_chunks(self, project_id: str, user_id: str, chunks: List[Dict]):
    metadatas = [
        {
            "project_id": project_id,
            "user_id": user_id,  # ✅ MVP 就加上
            "chunk_index": chunk["chunk_index"],
        }
        for chunk in chunks
    ]
    self.collection.add(documents=documents, metadatas=metadatas, ids=ids)

# 检索时强制过滤
async def search(self, project_id: str, user_id: str, query: str):
    return self.collection.query(
        query_texts=[query],
        where={
            "project_id": project_id,
            "user_id": user_id  # ✅ 强制过滤
        }
    )
```

**工作量**：0.5 天（MVP 阶段）vs 3-5 天（后续改造）

---

### 3. 文件访问权限控制（必须）

#### 为什么必须在 MVP 就做

**如果不做**：
- 任何人都能下载其他用户文件
- 文件存储结构需要重新设计
- 改造成本：2-3 天

**MVP 实现方案**：

```python
# 文件存储按用户组织
# uploads/{user_id}/{project_id}/{filename}

@router.get("/uploads/{file_id}")
async def download_file(
    file_id: str,
    user_id: str = Depends(get_current_user)  # ✅ MVP 就加上认证
):
    file = await db_service.get_upload(file_id)
    if not file:
        raise HTTPException(404)
    
    # ✅ 权限检查
    project = await db_service.get_project(file.projectId)
    if project.userId != user_id:
        raise HTTPException(403)
    
    return FileResponse(file.filepath)
```

**工作量**：1 天（MVP 阶段）vs 2-3 天（后续改造）

---

### 4. API 幂等性设计（建议）

#### 为什么建议在 MVP 就做

**如果不做**：
- 网络抖动导致重复任务
- 浪费 AI API 配额
- 改造成本：3-4 天

**MVP 实现方案（简化版）**：

```python
# 使用数据库而不是 Redis（MVP 阶段）
model IdempotencyKey {
  key       String   @id
  response  String   // JSON
  createdAt DateTime @default(now())
  
  @@index([createdAt])  // 定期清理过期记录
}

@router.post("/generate/courseware")
async def create_generation_task(
    request: GenerateRequest,
    idempotency_key: str = Header(None),
    user_id: str = Depends(get_current_user)
):
    # ✅ 检查幂等性
    if idempotency_key:
        cached = await db_service.get_idempotency_key(idempotency_key)
        if cached:
            return json.loads(cached.response)
    
    # 创建任务
    task = await db_service.create_generation_task(user_id, request)
    response = {"task_id": task.id}
    
    # ✅ 保存幂等性记录
    if idempotency_key:
        await db_service.save_idempotency_key(
            idempotency_key,
            json.dumps(response)
        )
    
    return response
```

**工作量**：1-2 天（MVP 阶段）vs 3-4 天（后续改造）

---

### 5. 基础限流机制（建议）

#### 为什么建议在 MVP 就做

**如果不做**：
- 恶意用户耗尽 API 配额
- 费用失控
- 改造成本：2-3 天

**MVP 实现方案（最简单）**：

```python
# 使用 slowapi（内存限流，MVP 够用）
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

# ✅ 关键接口加限流
@router.post("/generate/courseware")
@limiter.limit("10/hour")  # 每小时最多 10 次
async def create_generation_task(...):
    pass

@router.post("/upload")
@limiter.limit("20/hour")  # 每小时最多 20 次
async def upload_file(...):
    pass
```

**工作量**：0.5 天（MVP 阶段）vs 2-3 天（后续改造）

---

### 6. 统一错误处理（建议）

#### 为什么建议在 MVP 就做

**如果不做**：
- 错误信息不一致
- 前端难以处理
- 改造成本：2-3 天

**MVP 实现方案**：

```python
# 定义标准错误响应
class ErrorCode(str, Enum):
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    QUOTA_EXCEEDED = "QUOTA_EXCEEDED"
    INVALID_INPUT = "INVALID_INPUT"

class APIException(Exception):
    def __init__(self, code: ErrorCode, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code

# ✅ 全局异常处理
@app.exception_handler(APIException)
async def api_exception_handler(request: Request, exc: APIException):
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

# 使用
if not project:
    raise APIException(ErrorCode.NOT_FOUND, "项目不存在", 404)
```

**工作量**：1 天（MVP 阶段）vs 2-3 天（后续改造）

---

### 7. 结构化日志（建议）

#### 为什么建议在 MVP 就做

**如果不做**：
- 问题排查困难
- 无法做数据分析
- 改造成本：2-3 天

**MVP 实现方案（最简单）**：

```python
# 使用 Python 标准库 + JSON 格式
import logging
import json
from datetime import datetime

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
        }
        if hasattr(record, "user_id"):
            log_data["user_id"] = record.user_id
        if hasattr(record, "project_id"):
            log_data["project_id"] = record.project_id
        return json.dumps(log_data)

# ✅ 配置日志
handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logger = logging.getLogger("spectra")
logger.addHandler(handler)

# 使用
logger.info("project_created", extra={
    "user_id": user_id,
    "project_id": project.id
})
```

**工作量**：0.5 天（MVP 阶段）vs 2-3 天（后续改造）

---

## MVP 可以暂缓的设计

### 1. 分布式锁（可暂缓）

**原因**：
- MVP 阶段单机部署
- 并发量不高
- 可以用数据库乐观锁替代

**暂缓方案**：
```python
# 使用数据库状态检查（乐观锁）
async def process_task(task_id: str):
    # 原子更新状态
    updated = await db_service.update_task_status_if(
        task_id,
        from_status="pending",
        to_status="processing"
    )
    if not updated:
        return  # 已被其他进程处理
    
    # 处理任务
    # ...
```

**何时需要**：多实例部署时

---

### 2. 配额管理系统（可暂缓）

**原因**：
- MVP 阶段用户量少
- 可以手动监控
- 有限流已经够用

**暂缓方案**：
- 使用 API 限流控制使用量
- 手动监控 AI API 费用

**何时需要**：商业化时

---

### 3. 审计日志（可暂缓）

**原因**：
- MVP 阶段不需要合规
- 有基础日志已经够用

**何时需要**：正式上线时

---

### 4. 自动备份（可暂缓）

**原因**：
- MVP 阶段可以手动备份
- 数据量不大

**暂缓方案**：
```bash
# 手动备份脚本
./scripts/backup.sh
```

**何时需要**：有真实用户数据时

---

## MVP 架构改进清单

### 必须在 MVP 实现（总计 5-7 天）

- [x] 1. 用户认证与数据隔离（2-3 天）
- [x] 2. 向量数据库用户隔离（0.5 天）
- [x] 3. 文件访问权限控制（1 天）
- [x] 4. API 幂等性设计（1-2 天）
- [x] 5. 基础限流机制（0.5 天）
- [x] 6. 统一错误处理（1 天）
- [x] 7. 结构化日志（0.5 天）

### 可以暂缓（后续 2-3 周）

- [ ] 分布式锁（多实例部署时）
- [ ] 配额管理系统（商业化时）
- [ ] 审计日志（正式上线时）
- [ ] 自动备份（有真实用户时）

## 改进后的 MVP 架构

### 数据模型（改进版）

```prisma
// ✅ 添加用户模型
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  username  String
  
  projects  Project[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([email])
}

// ✅ 所有表添加用户关联
model Project {
  id          String   @id @default(uuid())
  userId      String   // ✅ 新增
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  name        String
  description String?
  subject     String?
  gradeLevel  String?
  duration    Int?
  status      String   @default("draft")
  
  conversations   Conversation[]
  uploads         Upload[]
  generationTasks GenerationTask[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([userId, status])
  @@index([userId, createdAt])
}

// ✅ 幂等性支持
model IdempotencyKey {
  key       String   @id
  response  String
  createdAt DateTime @default(now())
  
  @@index([createdAt])
}

// 其他表保持不变，通过 project.userId 间接关联
```

### API 设计（改进版）

```python
# ✅ 所有接口添加认证
@router.post("/api/v1/projects")
async def create_project(
    request: CreateProjectRequest,
    user_id: str = Depends(get_current_user)  # ✅ 认证
):
    project = await db_service.create_project(
        user_id=user_id,  # ✅ 关联用户
        **request.dict()
    )
    return {"success": True, "data": {"project": project}}

# ✅ 添加权限检查
@router.get("/api/v1/projects/{project_id}")
async def get_project(
    project_id: str,
    user_id: str = Depends(get_current_user)
):
    project = await db_service.get_project(project_id)
    if not project:
        raise APIException(ErrorCode.NOT_FOUND, "项目不存在", 404)
    
    # ✅ 权限检查
    if project.userId != user_id:
        raise APIException(ErrorCode.FORBIDDEN, "无权访问", 403)
    
    return {"success": True, "data": {"project": project}}

# ✅ 添加幂等性和限流
@router.post("/api/v1/generate/courseware")
@limiter.limit("10/hour")  # ✅ 限流
async def create_generation_task(
    request: GenerateRequest,
    idempotency_key: str = Header(None),  # ✅ 幂等性
    user_id: str = Depends(get_current_user)
):
    # 检查幂等性
    if idempotency_key:
        cached = await db_service.get_idempotency_key(idempotency_key)
        if cached:
            return json.loads(cached.response)
    
    # 创建任务
    task = await db_service.create_generation_task(user_id, request)
    response = {"task_id": task.id}
    
    # 保存幂等性记录
    if idempotency_key:
        await db_service.save_idempotency_key(idempotency_key, json.dumps(response))
    
    return response
```

### 前端改造（改进版）

```typescript
// ✅ 添加认证状态管理
interface AuthState {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

// ✅ API 请求自动添加 token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ✅ 添加幂等性 key
const generateCourseware = async (data: GenerateRequest) => {
  const idempotencyKey = uuidv4();
  return apiClient.post('/generate/courseware', data, {
    headers: {
      'Idempotency-Key': idempotencyKey
    }
  });
};
```

## 成本对比

| 项目 | MVP 阶段实现 | 后续改造 | 节省 |
|------|------------|---------|------|
| 用户认证与隔离 | 2-3 天 | 10-16 天 | 7-13 天 |
| 向量数据库隔离 | 0.5 天 | 3-5 天 | 2.5-4.5 天 |
| 文件权限控制 | 1 天 | 2-3 天 | 1-2 天 |
| API 幂等性 | 1-2 天 | 3-4 天 | 1-2 天 |
| 限流机制 | 0.5 天 | 2-3 天 | 1.5-2.5 天 |
| 错误处理 | 1 天 | 2-3 天 | 1-2 天 |
| 结构化日志 | 0.5 天 | 2-3 天 | 1.5-2.5 天 |
| **总计** | **5-7 天** | **24-37 天** | **16-28 天** |

## 结论

**在 MVP 阶段多花 5-7 天做对的设计，可以节省后续 16-28 天的返工成本。**

这些改进：
- ✅ 不增加复杂度（都是简化版实现）
- ✅ 不影响 MVP 功能（只是加了必要的基础设施）
- ✅ 避免后续高成本返工
- ✅ 为扩展预留空间

## 建议行动

1. **立即更新架构文档**，纳入这些改进
2. **更新 Prisma Schema**，添加 User 模型和用户关联
3. **更新 OpenAPI 规范**，添加认证和错误码定义
4. **按改进后的架构开始开发**，一次做对

## 相关决策

- ADR-010: 用户数据隔离设计
- ADR-011: 关键架构问题分析
- ADR-001: 技术栈选型
- ADR-003: 数据库设计
