"""
RQ 任务执行器

执行课件生成任务，包含错误处理和状态更新。
"""

import json
import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)


# 定义可重试的错误类型
RETRYABLE_ERRORS = (
    ConnectionError,
    TimeoutError,
    OSError,  # 包含网络和文件系统临时错误
)


async def execute_generation_task(
    task_id: str,
    project_id: str,
    task_type: str,
    template_config: Optional[dict] = None,
):
    """
    执行课件生成任务

    Args:
        task_id: 任务 ID
        project_id: 项目 ID
        task_type: 任务类型（pptx/docx/both）
        template_config: 模板配置（可选）

    Raises:
        Exception: 任务执行失败时抛出异常
    """
    from services.database import db_service

    start_time = time.time()

    try:
        logger.info(
            "generation_task_processing_started",
            extra={
                "task_id": task_id,
                "project_id": project_id,
                "task_type": task_type,
                "timestamp": time.time(),
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

        # 构建用户需求
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
                "execution_time": time.time() - start_time,
                "timestamp": time.time(),
            },
        )

    except RETRYABLE_ERRORS as e:
        # 可重试错误：记录日志，增加重试计数，抛出异常触发 RQ 重试
        logger.warning(
            f"Retryable error in task {task_id}: {type(e).__name__}: {str(e)}",
            extra={
                "task_id": task_id,
                "project_id": project_id,
                "error_type": type(e).__name__,
                "execution_time": time.time() - start_time,
                "timestamp": time.time(),
            },
        )

        # 增加重试计数
        try:
            await db_service.increment_task_retry_count(task_id)
        except Exception as db_error:
            logger.error(f"Failed to increment retry count: {db_error}")

        # 重新抛出异常以触发 RQ 重试机制
        raise

    except (ValueError, KeyError, TypeError) as e:
        # 不可重试错误（参数/数据错误）：记录日志，标记为 failed
        logger.error(
            f"Permanent error in task {task_id}: {type(e).__name__}: {str(e)}",
            extra={
                "task_id": task_id,
                "project_id": project_id,
                "error_type": type(e).__name__,
                "execution_time": time.time() - start_time,
                "timestamp": time.time(),
            },
            exc_info=True,
        )

        # 更新任务状态为 failed，不重试
        await db_service.update_generation_task_status(
            task_id=task_id,
            status="failed",
            error_message=f"{type(e).__name__}: {str(e)}",
        )

        # 不抛出异常，避免触发重试

    except Exception as e:
        # 未知错误：记录详细日志，更新状态为 failed
        logger.error(
            f"Unknown error in task {task_id}: {type(e).__name__}: {str(e)}",
            extra={
                "task_id": task_id,
                "project_id": project_id,
                "error_type": type(e).__name__,
                "execution_time": time.time() - start_time,
                "timestamp": time.time(),
            },
            exc_info=True,
        )

        # 更新任务状态为 failed
        await db_service.update_generation_task_status(
            task_id=task_id,
            status="failed",
            error_message=f"{type(e).__name__}: {str(e)}",
        )

        # 对于未知错误，也抛出异常以触发重试（但会受到最大重试次数限制）
        raise


async def _build_user_requirements(project_id: str) -> str:
    """
    构建用户需求文本

    Args:
        project_id: 项目 ID

    Returns:
        用户需求文本
    """
    from services.database import db_service

    # 获取项目信息
    project = await db_service.get_project(project_id)
    if not project:
        return "生成课件"

    # 获取最近的聊天消息
    messages = await db_service.get_messages(project_id, limit=10)

    # 过滤出用户消息
    user_messages = [msg for msg in messages if msg.role == "user"]

    # 构建需求文本
    requirements_parts = [f"项目名称：{project.name}"]

    if project.description:
        requirements_parts.append(f"项目描述：{project.description}")

    if user_messages:
        requirements_parts.append("\n用户需求：")
        for msg in reversed(user_messages[-3:]):  # 最近3条用户消息
            requirements_parts.append(f"- {msg.content}")

    return "\n".join(requirements_parts)
