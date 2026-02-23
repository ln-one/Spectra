# Service Layer Design

## 设计原则

- **业务封装**：封装核心业务逻辑，对外提供清晰接口
- **服务编排**：协调多个服务调用，处理复杂业务流程
- **异步处理**：使用 async/await 处理 IO 密集型操作
- **错误处理**：捕获异常，返回友好错误信息
- **可测试性**：服务间松耦合，便于单元测试

## Service 列表

| Service | 文件 | 功能 | 依赖 |
|---------|------|------|------|
| DatabaseService | database.py | 数据库 CRUD | Prisma |
| AIService | ai.py | LLM 调用 | LiteLLM |
| FileService | file.py | 文件存储 | 本地文件系统 |
| ParseService | parse_service.py | 文档解析 | LlamaParse |
| VideoService | video_service.py | 视频处理 | Qwen-VL API |
| RAGService | rag_service.py | RAG 检索 | ChromaDB |
| GenerationService | generation_service.py | 课件生成 | Marp, Pandoc |

## 异步任务处理

使用 **FastAPI BackgroundTasks** 处理异步任务（文件解析、课件生成）。
<!-- REVIEW #B10 (P2): 文档示例强调后台任务编排，但当前 backend/routers/generate.py 仍为 mock 返回，尚未接入 BackgroundTasks/任务队列实现。 -->

```python
# routers/generate.py
from fastapi import BackgroundTasks

@router.post("/courseware")
async def create_generation_task(
    request: GenerateRequest,
    background_tasks: BackgroundTasks
):
    """创建课件生成任务"""
    # 1. 创建任务记录
    task = await db_service.create_generation_task(
        project_id=request.project_id,
        task_type="courseware",
        status="pending"
    )
    
    # 2. 添加后台任务
    background_tasks.add_task(
        process_generation_task,
        task_id=task.id,
        request=request
    )
    
    # 3. 立即返回任务 ID
    return {
        "success": True,
        "data": {"task_id": task.id},
        "message": "任务已创建"
    }
```

详细实现参见各服务文档。
