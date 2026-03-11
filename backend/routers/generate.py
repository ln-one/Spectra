import asyncio
import json
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.encoders import jsonable_encoder
from starlette.concurrency import run_in_threadpool

from schemas.generation import GenerateRequest
from services.database import db_service
from utils.dependencies import get_current_user
from utils.deprecation import apply_deprecation_headers, log_deprecated_call
from utils.exceptions import APIException, ForbiddenException, NotFoundException
from utils.legacy_guard import assert_legacy_enabled
from utils.responses import success_response

router = APIRouter(prefix="/generate", tags=["Generate"])
logger = logging.getLogger(__name__)


async def process_generation_task(
    task_id: str,
    project_id: str,
    task_type: str,
    template_config: Optional[dict] = None,
) -> None:
    """Backward-compatible wrapper for background generation execution."""
    from services.task_executor import execute_generation_task

    await execute_generation_task(
        task_id=task_id,
        project_id=project_id,
        task_type=task_type,
        template_config=template_config,
    )


def _is_requirement_like_message(message: str) -> bool:
    """
    过滤与课件生成无关的闲聊消息，避免污染最终生成需求。
    """
    from schemas.intent import IntentType
    from services.ai import AIService

    text = (message or "").strip()
    if len(text) < 4:
        return False

    # 常见闲聊关键词（MVP 规则过滤）
    smalltalk_keywords = [
        "天气",
        "吃饭",
        "电影",
        "周末",
        "哈哈",
        "早上好",
        "晚上好",
        "在吗",
        "hello",
        "hi",
    ]
    if any(kw in text.lower() for kw in smalltalk_keywords):
        return False

    requirement_hint_keywords = [
        "加入",
        "增加",
        "补充",
        "案例",
        "实验",
        "例题",
        "练习",
        "重点",
        "难点",
        "目标",
    ]
    if any(kw in text for kw in requirement_hint_keywords):
        return True

    intent = AIService._classify_intent_by_keywords(text).intent
    if intent in {IntentType.DESCRIBE_REQUIREMENT, IntentType.MODIFY_COURSEWARE}:
        return True

    # CONFIRM_GENERATION 关键词里包含“好的/可以”，单独加学科语义门槛
    if intent == IntentType.CONFIRM_GENERATION:
        topic_keywords = [
            "课件",
            "ppt",
            "教学",
            "学科",
            "年级",
            "章节",
            "目标",
            "重难点",
            "教案",
            "讲义",
        ]
        return any(kw in text.lower() for kw in topic_keywords)

    return False


async def _build_user_requirements(project_id: str) -> str:
    """
    组合项目描述与最近用户对话，作为最终生成需求输入。
    """
    project = await db_service.get_project(project_id)
    base_requirement = "通用课件"
    if project:
        if project.description:
            base_requirement = project.description.strip()
        elif project.name:
            base_requirement = project.name.strip()

    # 拉取最近对话并拼接用户侧补充需求，避免“固定模板化”输出
    recent_messages = await db_service.get_conversation_messages(
        project_id=project_id,
        page=1,
        limit=50,
    )
    user_messages = [
        m.content.strip()
        for m in recent_messages
        if m.role == "user" and m.content and m.content.strip()
    ]

    recent_user_messages = user_messages[-30:]
    filtered_messages: list[str] = []
    started_collecting = False
    non_requirement_streak = 0

    # 从最近消息向前回溯，仅抽取最近一段“需求连续区间”
    for message in reversed(recent_user_messages):
        if _is_requirement_like_message(message):
            filtered_messages.append(message)
            started_collecting = True
            non_requirement_streak = 0
            if len(filtered_messages) >= 6:
                break
            continue

        if started_collecting:
            non_requirement_streak += 1
            if non_requirement_streak >= 2:
                break

    if not filtered_messages:
        return base_requirement

    filtered_messages.reverse()
    recent_user_context = "\n".join(f"- {msg}" for msg in filtered_messages)
    return (
        f"{base_requirement}\n\n"
        "以下是用户在对话中补充的具体要求，请严格纳入生成：\n"
        f"{recent_user_context}"
    )


@router.post("/courseware")
async def generate_courseware(
    http_request: Request,
    request: GenerateRequest,
    response: Response,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """
    生成课件

    创建一个后台生成任务，立即返回任务 ID。
    任务将在后台异步处理，用户可通过 /generate/tasks/{task_id}/status (under /api/v1)查询状态。

    Args:
        request: 生成请求（包含项目ID和生成类型）
        user_id: 当前用户ID（从认证依赖获取）
        idempotency_key: 幂等性密钥（可选）

    Returns:
        标准响应格式，data 中包含 task_id 和 status

    Raises:
        HTTPException: 项目不存在或无权限访问时抛出
    """
    try:
        assert_legacy_enabled()
        apply_deprecation_headers(
            response,
            replacement="/api/v1/generate/sessions",
        )
        log_deprecated_call(
            logger,
            http_request,
            user_id,
            replacement="/api/v1/generate/sessions",
        )
        # 验证项目归属
        project = await db_service.get_project(request.project_id)
        if not project:
            raise NotFoundException(
                message=f"项目不存在: {request.project_id}",
            )

        if project.userId != user_id:
            raise ForbiddenException(
                message="无权限访问此项目",
            )

        # 幂等性检查
        key_str = str(idempotency_key) if idempotency_key else None
        cache_key = (
            f"generate:courseware:{user_id}:{request.project_id}:{key_str}"
            if key_str
            else None
        )
        if cache_key:
            cached_response = await db_service.get_idempotency_response(cache_key)
            if cached_response:
                logger.info(
                    "idempotency_cache_hit",
                    extra={
                        "user_id": user_id,
                        "project_id": request.project_id,
                        "idempotency_key": key_str,
                    },
                )
                return cached_response

        # 创建生成任务
        task = await db_service.create_generation_task(
            project_id=request.project_id,
            task_type=request.type.value,
            template_config=(
                request.template_config.model_dump()
                if request.template_config
                else None
            ),
        )

        # 使用 RQ 提交任务到队列
        task_queue_service = getattr(http_request.app.state, "task_queue_service", None)
        rq_job_id = None
        template_config = (
            request.template_config.model_dump() if request.template_config else None
        )
        if task_queue_service is None:
            logger.warning(
                "task_queue_service_unavailable_fallback_local_execution",
                extra={
                    "user_id": user_id,
                    "project_id": request.project_id,
                    "task_id": task.id,
                    "type": request.type.value,
                },
            )
            asyncio.create_task(
                process_generation_task(
                    task_id=task.id,
                    project_id=request.project_id,
                    task_type=request.type.value,
                    template_config=template_config,
                )
            )
        else:
            job = task_queue_service.enqueue_generation_task(
                task_id=task.id,
                project_id=request.project_id,
                task_type=request.type.value,
                template_config=template_config,
                priority="default",
            )
            rq_job_id = job.id
            # 将 RQ Job ID 存储到数据库
            await db_service.update_generation_task_rq_job_id(task.id, rq_job_id)

        logger.info(
            "courseware_generation_started",
            extra={
                "user_id": user_id,
                "project_id": request.project_id,
                "task_id": task.id,
                "rq_job_id": rq_job_id,
                "type": request.type.value,
                "idempotency_key": key_str,
            },
        )

        response_payload = success_response(
            data={
                "task_id": task.id,
                "status": "pending",
            },
            message="课件生成任务已创建",
        )

        # 保存幂等性响应
        if cache_key:
            await db_service.save_idempotency_response(
                cache_key, jsonable_encoder(response_payload)
            )

        return response_payload

    except APIException as e:
        logger.error(
            f"Failed to generate courseware: {e.message}",
            extra={
                "user_id": user_id,
                "project_id": request.project_id,
                "error_code": e.error_code,
            },
        )
        raise
    except Exception as e:
        logger.error(
            f"Failed to generate courseware: {str(e)}",
            extra={"user_id": user_id, "project_id": request.project_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate courseware",
        )


@router.get("/tasks/{task_id}/status")
async def get_generation_status(
    task_id: str,
    http_request: Request,
    response: Response,
    user_id: str = Depends(get_current_user),
):
    """
    查询生成状态

    查询指定任务的生成状态、进度和结果。
    优先从数据库查询，如果任务在队列中则从 Redis 获取实时状态。

    Args:
        task_id: 任务ID
        user_id: 当前用户ID（从认证依赖获取）

    Returns:
        生成任务状态信息

    Raises:
        HTTPException: 任务不存在或无权限访问时抛出
    """
    try:
        assert_legacy_enabled()
        apply_deprecation_headers(
            response,
            replacement="/api/v1/generate/sessions/{session_id}",
        )
        log_deprecated_call(
            logger,
            http_request,
            user_id,
            replacement="/api/v1/generate/sessions/{session_id}",
        )
        # 获取任务
        task = await db_service.get_generation_task(task_id)
        if not task:
            raise NotFoundException(
                message=f"任务不存在: {task_id}",
            )

        # 验证权限：检查任务所属项目是否属于当前用户
        project = await db_service.get_project(task.projectId)
        if not project or project.userId != user_id:
            raise ForbiddenException(
                message="无权限访问此任务",
            )

        # 如果任务状态为 pending 或 processing，尝试从 Redis 获取实时状态
        task_status = task.status
        if (
            task_status in ["pending", "processing"]
            and hasattr(task, "rqJobId")
            and task.rqJobId
        ):
            try:
                task_queue_service = getattr(
                    http_request.app.state, "task_queue_service", None
                )
                if task_queue_service:
                    job_status = await run_in_threadpool(
                        task_queue_service.get_job_status, task.rqJobId
                    )
                    if job_status:
                        # 映射 RQ 状态到我们的状态
                        rq_status = job_status.get("status")
                        if rq_status == "started":
                            task_status = "processing"
                        elif rq_status == "finished":
                            task_status = "completed"
                        elif rq_status == "failed":
                            task_status = "failed"
                        elif rq_status in ["queued", "deferred", "scheduled"]:
                            task_status = "pending"
            except Exception as e:
                logger.warning(
                    f"Failed to get job status from Redis: {e}",
                    extra={"task_id": task_id, "rq_job_id": task.rqJobId},
                )

        logger.info(
            "generation_status_checked",
            extra={"user_id": user_id, "task_id": task_id, "status": task_status},
        )

        # 解析输出 URLs
        result = None
        if task.outputUrls:
            try:
                result = json.loads(task.outputUrls)
            except json.JSONDecodeError:
                logger.warning(f"Failed to parse outputUrls for task {task_id}")

        return success_response(
            data={
                "task_id": task.id,
                "status": task_status,
                "progress": task.progress,
                "result": result,
                "error": task.errorMessage,
                "created_at": task.createdAt.isoformat(),
                "updated_at": task.updatedAt.isoformat(),
            },
            message="获取生成状态成功",
        )

    except APIException as e:
        logger.error(
            f"Failed to get generation status: {e.message}",
            extra={"user_id": user_id, "task_id": task_id, "error_code": e.error_code},
        )
        raise
    except Exception as e:
        logger.error(
            f"Failed to get generation status: {str(e)}",
            extra={"user_id": user_id, "task_id": task_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get generation status",
        )


@router.get("/tasks/{task_id}/versions")
async def get_task_versions(
    task_id: str,
    http_request: Request,
    response: Response,
    user_id: str = Depends(get_current_user),
):
    """
    获取任务的所有版本

    当前 MVP 实现：将任务本身作为第 1 版本返回。

    Args:
        task_id: 任务ID
        user_id: 当前用户ID（从认证依赖获取）

    Returns:
        包含版本列表的标准响应

    Raises:
        HTTPException: 任务不存在或无权限时抛出
    """
    try:
        assert_legacy_enabled()
        apply_deprecation_headers(
            response,
            replacement="/api/v1/generate/sessions/{session_id}",
        )
        log_deprecated_call(
            logger,
            http_request,
            user_id,
            replacement="/api/v1/generate/sessions/{session_id}",
        )
        task = await db_service.get_generation_task(task_id)
        if not task:
            raise NotFoundException(
                message=f"任务不存在: {task_id}",
            )

        project = await db_service.get_project(task.projectId)
        if not project or project.userId != user_id:
            raise ForbiddenException(
                message="无权限访问此任务",
            )

        file_urls = {}
        if task.outputUrls:
            try:
                parsed = json.loads(task.outputUrls)
                if "pptx" in parsed:
                    file_urls["ppt_url"] = parsed["pptx"]
                if "docx" in parsed:
                    file_urls["word_url"] = parsed["docx"]
            except json.JSONDecodeError:
                pass
        versions = [
            {
                "version": 1,
                "created_at": task.createdAt.isoformat(),
                "status": task.status,
                "file_urls": file_urls,
                "modification_note": None,
            }
        ]

        logger.info(
            "task_versions_fetched",
            extra={"user_id": user_id, "task_id": task_id, "count": len(versions)},
        )

        return success_response(
            data={"task_id": task_id, "versions": versions},
            message="获取版本列表成功",
        )

    except APIException as e:
        logger.error(
            f"Failed to get task versions: {e.message}",
            extra={"user_id": user_id, "task_id": task_id, "error_code": e.error_code},
        )
        raise
    except Exception as e:
        logger.error(
            f"Failed to get task versions: {str(e)}",
            extra={"user_id": user_id, "task_id": task_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get task versions",
        )
