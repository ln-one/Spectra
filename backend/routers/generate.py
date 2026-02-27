import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status

from schemas.generation import GenerateRequest
from services.database import db_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ForbiddenException, NotFoundException
from utils.responses import success_response

router = APIRouter(prefix="/generate", tags=["Generate"])
logger = logging.getLogger(__name__)


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
    request: GenerateRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """
    生成课件

    创建一个后台生成任务，立即返回任务 ID。
    任务将在后台异步处理，用户可通过 /generate/status/{task_id} 查询状态。

    Args:
        request: 生成请求（包含项目ID和生成类型）
        background_tasks: FastAPI 后台任务
        user_id: 当前用户ID（从认证依赖获取）
        idempotency_key: 幂等性密钥（可选）

    Returns:
        标准响应格式，data 中包含 task_id 和 status

    Raises:
        HTTPException: 项目不存在或无权限访问时抛出
    """
    try:
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

        # TODO: 实现幂等性检查
        # if idempotency_key:
        #     existing_response = await db_service.get_idempotency_response(
        #         idempotency_key
        #     )
        #     if existing_response:
        #         return existing_response

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

        # 添加后台任务
        background_tasks.add_task(
            process_generation_task,
            task_id=task.id,
            project_id=request.project_id,
            task_type=request.type.value,
            template_config=(
                request.template_config.model_dump()
                if request.template_config
                else None
            ),
        )

        logger.info(
            "courseware_generation_started",
            extra={
                "user_id": user_id,
                "project_id": request.project_id,
                "task_id": task.id,
                "type": request.type.value,
            },
        )

        # TODO: 保存幂等性响应
        # if idempotency_key:
        #     await db_service.save_idempotency_response(idempotency_key, response)

        return success_response(
            data={
                "task_id": task.id,
                "status": "pending",
            },
            message="课件生成任务已创建",
        )

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


async def process_generation_task(
    task_id: str,
    project_id: str,
    task_type: str,
    template_config: Optional[dict] = None,
):
    """
    后台任务：处理课件生成

    Args:
        task_id: 任务 ID
        project_id: 项目 ID
        task_type: 任务类型（pptx/docx/both）
        template_config: 模板配置
    """
    try:
        logger.info(
            "generation_task_processing_started",
            extra={
                "task_id": task_id,
                "project_id": project_id,
                "task_type": task_type,
            },
        )

        # 更新任务状态为 processing
        await db_service.update_generation_task_status(
            task_id=task_id,
            status="processing",
            progress=10,
        )

        # 调用 AI Service 获取课件内容
        from services.ai import ai_service
        from services.template import TemplateConfig

        logger.info(
            f"Calling AI service to generate courseware content for task {task_id}"
        )

        user_requirements = await _build_user_requirements(project_id)

        # 生成课件内容
        courseware_content = await ai_service.generate_courseware_content(
            project_id=project_id,
            user_requirements=user_requirements,
            template_style=(
                template_config.get("style", "default")
                if template_config
                else "default"
            ),
        )

        await db_service.update_generation_task_status(task_id, "processing", 30)

        # 调用 GenerationService 生成文件
        from services.generation import generation_service

        # 构建模板配置
        if template_config:
            tpl_config = TemplateConfig(**template_config)
        else:
            tpl_config = TemplateConfig()

        output_urls = {}

        if task_type in ["pptx", "both"]:
            logger.info(f"Generating PPTX for task {task_id}")
            pptx_path = await generation_service.generate_pptx(
                courseware_content, task_id, tpl_config
            )
            output_urls["pptx"] = (
                f"/api/v1/generate/tasks/{task_id}/download?file_type=ppt"
            )
            logger.info(f"PPTX generated: {pptx_path}")
            await db_service.update_generation_task_status(task_id, "processing", 60)

        if task_type in ["docx", "both"]:
            logger.info(f"Generating DOCX for task {task_id}")
            docx_path = await generation_service.generate_docx(
                courseware_content, task_id, tpl_config
            )
            output_urls["docx"] = (
                f"/api/v1/generate/tasks/{task_id}/download?file_type=word"
            )
            logger.info(f"DOCX generated: {docx_path}")
            await db_service.update_generation_task_status(task_id, "processing", 90)

        # 更新任务状态为 completed
        import json

        await db_service.update_generation_task_status(
            task_id=task_id,
            status="completed",
            progress=100,
            output_urls=json.dumps(output_urls),
        )

        logger.info(
            "generation_task_completed",
            extra={
                "task_id": task_id,
                "project_id": project_id,
                "output_urls": output_urls,
            },
        )

    except Exception as e:
        logger.error(
            f"Generation task failed: {str(e)}",
            extra={"task_id": task_id, "project_id": project_id},
            exc_info=True,
        )

        # 更新任务状态为 failed
        await db_service.update_generation_task_status(
            task_id=task_id,
            status="failed",
            error_message=str(e),
        )


@router.get("/tasks/{task_id}/status")
async def get_generation_status(
    task_id: str,
    user_id: str = Depends(get_current_user),
):
    """
    查询生成状态

    查询指定任务的生成状态、进度和结果。

    Args:
        task_id: 任务ID
        user_id: 当前用户ID（从认证依赖获取）

    Returns:
        生成任务状态信息

    Raises:
        HTTPException: 任务不存在或无权限访问时抛出
    """
    try:
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

        logger.info(
            "generation_status_checked",
            extra={"user_id": user_id, "task_id": task_id, "status": task.status},
        )

        # 解析输出 URLs
        import json

        result = None
        if task.outputUrls:
            try:
                result = json.loads(task.outputUrls)
            except json.JSONDecodeError:
                logger.warning(f"Failed to parse outputUrls for task {task_id}")

        return success_response(
            data={
                "task_id": task.id,
                "status": task.status,
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
