# Router Layer Design

## 设计原则

- **职责单一**：仅处理 HTTP 请求/响应，不包含业务逻辑
- **参数验证**：使用 Pydantic 模型自动验证请求参数
- **错误处理**：统一异常处理，返回标准错误格式
- **依赖注入**：通过 FastAPI Depends 注入服务实例

## Router 列表

| Router | 路径前缀 | 功能 | 状态 |
|--------|---------|------|------|
| auth.py | /api/v1/auth | 认证（register, login, refresh, logout, me） | 部分实现 |
| projects.py | /api/v1/projects | 项目 CRUD、统计、搜索 | 部分实现 |
| files.py | /api/v1/files | 文件上传、批量操作、标注 | 部分实现 |
| generate.py | /api/v1/generate | 课件生成、状态查询、下载、版本管理 | 部分实现 |
| chat.py | /api/v1/chat | 对话交互、语音消息 | 待实现 |
| preview.py | /api/v1/preview | 预览修改、幻灯片详情、导出 | 待实现 |
| rag.py | /api/v1/rag | RAG 检索、索引、相似内容查找 | 待实现 |

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
 
 return {
 "success": True,
 "data": {
 "id": ai_msg.id,
 "content": ai_response["content"],
 "role": "assistant",
 "createdAt": ai_msg.createdAt
 },
 "message": "消息发送成功"
 }
 except Exception as e:
 logger.error(f"Failed to process message: {str(e)}")
 raise HTTPException(
 status_code=500, 
 detail={
 "success": False,
 "error": {
 "code": "INTERNAL_ERROR",
 "message": str(e)
 },
 "message": "消息处理失败"
 }
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

## 端点详细列表

### 认证模块 (auth.py)

| 方法 | 路径 | 功能 | 状态 |
|------|------|------|------|
| POST | /api/v1/auth/register | 用户注册 | 部分实现 |
| POST | /api/v1/auth/login | 用户登录 | 部分实现 |
| POST | /api/v1/auth/refresh | 刷新 Access Token | 待实现 |
| POST | /api/v1/auth/logout | 退出登录 | 待实现 |
| GET | /api/v1/auth/me | 获取当前用户信息 | 待实现 |

### 项目模块 (projects.py)

| 方法 | 路径 | 功能 | 状态 |
|------|------|------|------|
| POST | /api/v1/projects | 创建项目 | 部分实现 |
| GET | /api/v1/projects | 获取项目列表 | 部分实现 |
| GET | /api/v1/projects/{project_id} | 获取项目详情 | 部分实现 |
| PUT | /api/v1/projects/{project_id} | 修改项目信息 | 部分实现 |
| DELETE | /api/v1/projects/{project_id} | 删除项目 | 部分实现 |
| GET | /api/v1/projects/{project_id}/files | 获取项目的上传文件列表 | 待实现 |
| GET | /api/v1/projects/{project_id}/statistics | 获取项目统计信息 | 待实现 |
| GET | /api/v1/projects/search | 搜索项目 | 待实现 |

### 文件模块 (files.py)

| 方法 | 路径 | 功能 | 状态 |
|------|------|------|------|
| POST | /api/v1/files | 上传参考文件 | 部分实现 |
| DELETE | /api/v1/files/{file_id} | 删除上传的文件 | 部分实现 |
| PATCH | /api/v1/files/{file_id}/intent | 标注文件用途 | 待实现 |
| POST | /api/v1/files/batch | 批量上传文件 | 待实现 |
| DELETE | /api/v1/files/batch | 批量删除文件 | 待实现 |

### 生成模块 (generate.py)

| 方法 | 路径 | 功能 | 状态 |
|------|------|------|------|
| POST | /api/v1/generate/courseware | 生成课件 | 部分实现 |
| GET | /api/v1/generate/tasks/{task_id}/status | 查询生成状态 | 部分实现 |
| GET | /api/v1/generate/tasks/{task_id}/download | 下载生成的课件文件 | 部分实现 |
| GET | /api/v1/generate/tasks/{task_id}/versions | 获取任务的所有版本 | 待实现 |

### 对话模块 (chat.py)

| 方法 | 路径 | 功能 | 状态 |
|------|------|------|------|
| POST | /api/v1/chat/messages | 发送消息 | 待实现 |
| GET | /api/v1/chat/messages | 获取对话历史 | 待实现 |
| POST | /api/v1/chat/voice | 语音消息输入 | 待实现 |

### 预览模块 (preview.py)

| 方法 | 路径 | 功能 | 状态 |
|------|------|------|------|
| GET | /api/v1/preview/{task_id} | 获取课件预览 | 待实现 |
| POST | /api/v1/preview/{task_id}/modify | 提交修改指令 | 待实现 |
| GET | /api/v1/preview/{task_id}/slides/{slide_id} | 获取单个幻灯片详情 | 待实现 |
| POST | /api/v1/preview/{task_id}/export | 导出预览内容 | 待实现 |

### RAG 模块 (rag.py)

| 方法 | 路径 | 功能 | 状态 |
|------|------|------|------|
| POST | /api/v1/rag/search | 检索知识库 | 待实现 |
| GET | /api/v1/rag/sources/{chunk_id} | 查看来源详情 | 待实现 |
| POST | /api/v1/rag/index | 索引新文件到知识库 | 待实现 |
| POST | /api/v1/rag/similar | 查找相似内容 | 待实现 |

## 错误处理示例

```python
from fastapi import HTTPException
from utils.exceptions import ValidationError, UnauthorizedError, NotFoundError

@router.post("/api/v1/projects")
async def create_project(request: ProjectRequest):
 try:
 # 业务逻辑
 project = await project_service.create(request)
 
 return {
 "success": True,
 "data": project,
 "message": "项目创建成功"
 }
 except ValidationError as e:
 raise HTTPException(
 status_code=400,
 detail={
 "success": False,
 "error": {
 "code": "VALIDATION_ERROR",
 "message": str(e)
 },
 "message": "参数验证失败"
 }
 )
 except UnauthorizedError as e:
 raise HTTPException(
 status_code=401,
 detail={
 "success": False,
 "error": {
 "code": "UNAUTHORIZED",
 "message": str(e)
 },
 "message": "未授权访问"
 }
 )
 except NotFoundError as e:
 raise HTTPException(
 status_code=404,
 detail={
 "success": False,
 "error": {
 "code": "NOT_FOUND",
 "message": str(e)
 },
 "message": "资源不存在"
 }
 )
 except Exception as e:
 logger.error(f"Unexpected error: {str(e)}")
 raise HTTPException(
 status_code=500,
 detail={
 "success": False,
 "error": {
 "code": "INTERNAL_ERROR",
 "message": str(e)
 },
 "message": "服务器内部错误"
 }
 )
```

## 路径设计原则

1. **统一前缀**：所有 API 路径使用 `/api/v1` 前缀
2. **RESTful 设计**：面向资源的路径设计
3. **模块隔离**：不同功能模块使用独立的路径空间
4. **高内聚**：相关功能集中在同一 Router 中

示例：
- 生成的课件文件：`/api/v1/generate/tasks/{task_id}/download`
- 原始参考文件：`/api/v1/files/{file_id}`
- 项目文件列表：`/api/v1/projects/{project_id}/files`

这种设计保证了模块间的高内聚和低耦合，方便未来扩展。
