# Router Layer Design
<!-- REVIEW #B6 (P1): 本文内路径前缀口径不统一（既有 /api/v1/*，也有 /projects、/upload），与“统一 /api/v1”审核要求不一致。 -->
<!-- REVIEW #B7 (P1): 本文“错误响应”示例为 {success,data,message}，与当前后端实际/契约中的 {success,error,message} 口径冲突。 -->

## 设计原则

- **职责单一**：仅处理 HTTP 请求/响应，不包含业务逻辑
- **参数验证**：使用 Pydantic 模型自动验证请求参数
- **错误处理**：统一异常处理，返回标准错误格式
- **依赖注入**：通过 FastAPI Depends 注入服务实例

## Router 列表

| Router | 路径前缀 | 功能 | 状态 |
|--------|---------|------|------|
| projects.py | /projects | 项目 CRUD | ✅ 已实现 |
| chat.py | /api/v1/chat | 对话交互 | 🆕 待实现 |
| upload.py | /upload | 文件上传 | ✅ 已实现 |
| generate.py | /generate | 课件生成 | ✅ 已实现 |
| preview.py | /api/v1/preview | 预览修改 | 🆕 待实现 |
| rag.py | /api/v1/rag | RAG 检索 | 🆕 待实现 |
| courses.py | /courses | 课程管理 | ✅ 已实现 |

<!-- REVIEW #B6 (P1): 这里的 upload.py 路径与实际代码 backend/routers/files.py 不一致；projects/generate 的“已实现”状态也与当前存在 TODO/mock 的实现程度不匹配。 -->

## Router 实现模板

```python
# routers/chat.py
import logging
from typing import List
from fastapi import APIRouter, HTTPException, Depends

from schemas.chat import SendMessageRequest, MessageResponse
from services.ai import ai_service
from services.database import db_service

router = APIRouter(prefix="/api/v1/chat", tags=["Chat"])
logger = logging.getLogger(__name__)

@router.post("/messages", response_model=MessageResponse)
async def send_message(request: SendMessageRequest):
    """发送消息并获取 AI 回复"""
    try:
        # 1. 保存用户消息
        user_msg = await db_service.create_conversation(
            project_id=request.project_id,
            role="user",
            content=request.content
        )
        
        # 2. 获取对话历史
        history = await db_service.get_conversation_history(
            request.project_id
        )
        
        # 3. 调用 AI 服务生成回复
        ai_response = await ai_service.generate_chat_response(
            message=request.content,
            history=history
        )
        
        # 4. 保存 AI 回复
        ai_msg = await db_service.create_conversation(
            project_id=request.project_id,
            role="assistant",
            content=ai_response["content"]
        )
        
        return MessageResponse(
            id=ai_msg.id,
            content=ai_response["content"],
            role="assistant",
            createdAt=ai_msg.createdAt
        )
    except Exception as e:
        logger.error(f"Failed to process message: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail="Failed to process message"
        )
```

## 响应格式规范

所有 API 响应遵循统一格式：

```python
# 成功响应
{
    "success": true,
    "data": {...},
    "message": "操作成功"
}

# 错误响应
{
    "success": false,
    "error": {
        "code": "ERROR_CODE",
        "message": "详细错误描述",
        "details": {}
    },
    "message": "用户友好的错误消息"
}
```
