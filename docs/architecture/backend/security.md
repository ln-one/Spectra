# Security Design

## 权限检查

### 数据隔离原则

每个用户只能访问自己的数据，通过 `userId` 字段实现数据隔离。

### 实现方案

```python
# utils/dependencies.py
from fastapi import Depends, HTTPException

async def verify_project_access(
    project_id: str,
    current_user = Depends(get_current_user)
):
    """验证用户是否有权访问项目"""
    project = await db_service.get_project(project_id)
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.userId != current_user.id:
        raise HTTPException(
            status_code=403, 
            detail="Access denied"
        )
    
    return project
```

### 使用示例

```python
# routers/projects.py
@router.get("/projects/{project_id}")
async def get_project(
    project = Depends(verify_project_access)
):
    """获取项目详情（自动权限检查）"""
    return {"success": True, "data": project}

@router.delete("/projects/{project_id}")
async def delete_project(
    project = Depends(verify_project_access)
):
    """删除项目（自动权限检查）"""
    await db_service.delete_project(project.id)
    return {"success": True, "message": "Project deleted"}
```

## 幂等性设计

### 问题场景

- 网络重试导致重复请求
- 用户多次点击提交按钮
- 消息队列重复消费

### 解决方案

使用 **Idempotency Key** 实现幂等性。

```python
# schemas/common.py
from pydantic import BaseModel, Field
import uuid

class IdempotentRequest(BaseModel):
    """幂等请求基类"""
    idempotency_key: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="幂等性键"
    )
```

### 实现示例

```python
# services/idempotency_service.py
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class IdempotencyService:
    """幂等性服务"""
    
    async def check_and_store(
        self, 
        key: str, 
        user_id: str,
        ttl_hours: int = 24
    ) -> bool:
        """
        检查并存储幂等性键
        
        Returns:
            True: 首次请求，可以执行
            False: 重复请求，应返回缓存结果
        """
        # 检查是否存在
        existing = await db_service.get_idempotency_record(key, user_id)
        
        if existing:
            # 检查是否过期
            if existing.createdAt + timedelta(hours=ttl_hours) > datetime.now():
                logger.info(f"Duplicate request detected: {key}")
                return False
        
        # 存储新记录
        await db_service.create_idempotency_record(
            key=key,
            user_id=user_id,
            expires_at=datetime.now() + timedelta(hours=ttl_hours)
        )
        
        return True
    
    async def get_cached_response(self, key: str, user_id: str):
        """获取缓存的响应"""
        record = await db_service.get_idempotency_record(key, user_id)
        return record.response if record else None
    
    async def store_response(self, key: str, user_id: str, response: dict):
        """存储响应结果"""
        await db_service.update_idempotency_response(key, user_id, response)

idempotency_service = IdempotencyService()
```

### 使用示例

```python
# routers/generate.py
@router.post("/courseware")
async def create_generation_task(
    request: GenerateRequest,
    current_user = Depends(get_current_user)
):
    """创建课件生成任务（幂等）"""
    # 检查幂等性
    is_first_request = await idempotency_service.check_and_store(
        key=request.idempotency_key,
        user_id=current_user.id
    )
    
    if not is_first_request:
        # 返回缓存结果
        cached = await idempotency_service.get_cached_response(
            request.idempotency_key,
            current_user.id
        )
        return cached
    
    # 执行业务逻辑
    task = await db_service.create_generation_task(...)
    
    response = {
        "success": True,
        "data": {"task_id": task.id}
    }
    
    # 缓存响应
    await idempotency_service.store_response(
        request.idempotency_key,
        current_user.id,
        response
    )
    
    return response
```

## 限流设计

### 限流策略

- **用户级限流**：每个用户每分钟最多 60 次请求
- **IP 级限流**：每个 IP 每分钟最多 100 次请求
- **接口级限流**：敏感接口（如生成）单独限流

### 实现方案

使用 **slowapi** 库实现限流。

```python
# requirements.txt
slowapi==0.1.9
```

```python
# main.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

### 使用示例

```python
# routers/generate.py
from slowapi import Limiter
from fastapi import Request

@router.post("/courseware")
@limiter.limit("5/minute")  # 每分钟最多 5 次
async def create_generation_task(
    request: Request,
    data: GenerateRequest
):
    """创建课件生成任务（限流）"""
    # 业务逻辑
    pass
```

### 自定义限流键

```python
# utils/rate_limit.py
def get_user_id(request: Request) -> str:
    """从 JWT Token 提取用户 ID"""
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    try:
        payload = auth_service.verify_token(token)
        return payload.get("sub", "anonymous")
    except:
        return "anonymous"

# 使用用户 ID 作为限流键
limiter = Limiter(key_func=get_user_id)
```

## CORS 配置

```python
# main.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # 前端地址
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## 敏感信息保护

```python
# .env
JWT_SECRET_KEY=your-secret-key
DASHSCOPE_API_KEY=sk-xxx
LLAMA_PARSE_API_KEY=llx-xxx

# 禁止提交到 Git
# .gitignore
.env
*.key
```

## 相关文档

- [Authentication](./authentication.md) - 认证实现
- [Error Handling](./error-handling.md) - 安全错误处理
