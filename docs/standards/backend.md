# 后端代码规范

> 详细规约见 [CONTRIBUTING.md](../CONTRIBUTING.md)

## 技术栈

- FastAPI
- Python 3.11
- Pydantic v2
- Prisma ORM
- SQLite

## 命名规范

- 文件: `snake_case.py`
- 类: `PascalCase`
- 函数: `snake_case`
- 常量: `UPPER_SNAKE_CASE`

## 代码风格

- Black + PEP 8
- 4 空格缩进
- Type hints
- 单文件 <300 行

## 目录结构

```
routers/      # API 路由
services/     # 业务逻辑
schemas/      # Pydantic 数据模型
utils/        # 工具函数
prisma/       # 数据库
```

## 代码规范

```python
from typing import List
from pydantic import BaseModel

class Message(BaseModel):
    """消息模型"""
    content: str
    role: str

async def process_message(
    message: Message,
    context: List[Message]
) -> str:
    """
    处理用户消息
    
    Args:
        message: 用户消息
        context: 对话上下文
        
    Returns:
        AI生成的回复
    """
    pass
```

## 复杂度控制

单文件超过 300 行时，拆分为文件夹：

```
# 原始
chat_service.py

# 拆分后
chat_service/
├── __init__.py       # 编排者
├── processor.py      # 消息处理
├── generator.py      # 回复生成
└── types.py          # 类型定义
```

## API 规范

### RESTful
- URL: `/api/v1/资源名` (名词复数)
- 方法: GET/POST/PUT/PATCH/DELETE
- 状态码: 200/201/400/401/404/500

### 响应格式
```json
{
  "success": true,
  "data": {},
  "message": "操作成功"
}
```

### 路由示例
```python
from fastapi import APIRouter, Depends
from app.schemas.chat import SendMessageRequest, MessageResponse
from app.services.chat_service import ChatService

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

@router.post("/messages", response_model=MessageResponse)
async def send_message(
    request: SendMessageRequest,
    chat_service: ChatService = Depends(get_chat_service)
):
    """发送消息并获取AI回复"""
    return await chat_service.process_message(request)
```

## 异步编程

- 所有 IO 操作使用 async/await
- 数据库查询使用异步
- 外部 API 调用使用异步

## 错误处理

```python
from fastapi import HTTPException, status

class ServiceException(Exception):
    """服务异常基类"""
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
```

## 性能优化

- 使用缓存
- 数据库查询优化
- API 响应 <500ms
- 实现分页

