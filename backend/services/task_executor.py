"""
RQ 任务执行器

执行课件生成任务，包含错误处理和状态更新。
"""

import asyncio
import json
import logging
import time
import uuid
from typing import Optional

from rq import get_current_job

logger = logging.getLogger(__name__)


# 定义可重试的错误类型
RETRYABLE_ERRORS = (
    ConnectionError,
    TimeoutError,
    OSError,  # 包含网络和文件系统临时错误
)


async def _sync_session_terminal_state(
    db_service,
    task_id: str,
    session_id: Optional[str],
    state: str,
    state_reason: str,
    output_urls: Optional[dict] = None,
    error_message: Optional[str] = None,
    retryable: bool = False,
) -> None:
    """Keep session terminal state aligned with task terminal state."""
    if not session_id:
        return

    cursor = str(uuid.uuid4())
    if state == "SUCCESS":
        session_data = {
            "state": "SUCCESS",
            "pptUrl": (output_urls or {}).get("pptx"),
            "wordUrl": (output_urls or {}).get("docx"),
            "progress": 100,
            "errorCode": None,
            "errorMessage": None,
            "errorRetryable": False,
            "resumable": True,
        }
        payload = {"task_id": task_id, "output_urls": output_urls or {}}
    else:
        session_data = {
            "state": "FAILED",
            "errorCode": "TASK_EXECUTION_FAILED",
            "errorMessage": error_message,
            "errorRetryable": retryable,
            "resumable": True,
        }
        payload = {"task_id": task_id, "error": error_message, "retryable": retryable}

    await db_service.db.generationsession.update(
        where={"id": session_id},
        data=session_data,
    )
    await db_service.db.sessionevent.create(
        data={
            "sessionId": session_id,
            "eventType": "state.changed",
            "state": state,
            "stateReason": state_reason,
            "progress": 100 if state == "SUCCESS" else None,
            "cursor": cursor,
            "payload": json.dumps(payload),
            "schemaVersion": 1,
        }
    )
    await db_service.db.generationsession.update(
        where={"id": session_id},
        data={"lastCursor": cursor},
    )


def run_generation_task(
    task_id: str,
    project_id: str,
    task_type: str,
    template_config: Optional[dict] = None,
):
    """
    同步包装函数，供 RQ worker 调用。

    RQ 只能执行同步函数；此函数通过 asyncio.run 在新事件循环中执行
    真正的异步任务逻辑 execute_generation_task。

    Args:
        task_id: 任务 ID
        project_id: 项目 ID
        task_type: 任务类型（pptx/docx/both）
        template_config: 模板配置（可选）
    """
    asyncio.run(
        execute_generation_task(
            task_id=task_id,
            project_id=project_id,
            task_type=task_type,
            template_config=template_config,
        )
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
    from services.database import DatabaseService

    start_time = time.time()
    db_service = DatabaseService()
    db_connected = False
    session_id: Optional[str] = None

    try:
        # RQ 在任务执行时会创建/关闭事件循环，数据库连接必须在当前循环中建立
        await asyncio.wait_for(db_service.connect(), timeout=10)
        db_connected = True

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
        task_record = await db_service.get_generation_task(task_id)
        session_id = getattr(task_record, "sessionId", None)

        # 调用 AI Service 获取课件内容
        from services.ai import ai_service
        from services.template import TemplateConfig

        logger.info(
            f"Calling AI service to generate courseware content for task {task_id}"
        )

        # 构建用户需求（C5：project_id + session_id 隔离）
        user_requirements = await _build_user_requirements(
            db_service,
            project_id,
            session_id=session_id,
        )

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

        # C6: 成功时同步 Session 终态
        try:
            await _sync_session_terminal_state(
                db_service=db_service,
                task_id=task_id,
                session_id=session_id,
                state="SUCCESS",
                state_reason="task_completed",
                output_urls=output_urls,
            )
            if session_id:
                logger.info(
                    "session_state_updated_to_success",
                    extra={
                        "session_id": session_id,
                        "task_id": task_id,
                        "timestamp": time.time(),
                    },
                )
        except Exception as sync_err:
            logger.error(
                "failed_to_sync_session_success_state task_id=%s session_id=%s error=%s",
                task_id,
                session_id,
                sync_err,
                exc_info=True,
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

        try:
            await db_service.increment_task_retry_count(task_id)
        except Exception as db_error:
            logger.error(f"Failed to increment retry count: {db_error}")

        retries_left = 0
        try:
            current_job = get_current_job()
            retries_left = current_job.retries_left if current_job else 0
        except Exception as job_err:
            logger.error(
                "Could not determine retries_left for task %s: %s",
                task_id,
                job_err,
            )

        if retries_left <= 0:
            error_msg = f"{type(e).__name__}: {str(e)}"
            await db_service.update_generation_task_status(
                task_id=task_id,
                status="failed",
                error_message=error_msg,
            )
            try:
                await _sync_session_terminal_state(
                    db_service=db_service,
                    task_id=task_id,
                    session_id=session_id,
                    state="FAILED",
                    state_reason="task_failed_retry_exhausted",
                    error_message=error_msg,
                    retryable=True,
                )
            except Exception as sync_err:
                logger.error(
                    "failed_to_sync_session_failed_state task_id=%s session_id=%s error=%s",
                    task_id,
                    session_id,
                    sync_err,
                    exc_info=True,
                )

        raise

    except (ValueError, KeyError, TypeError) as e:
        # 不可重试错误（参数/数据错误）
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

        await db_service.update_generation_task_status(
            task_id=task_id,
            status="failed",
            error_message=f"{type(e).__name__}: {str(e)}",
        )
        try:
            await _sync_session_terminal_state(
                db_service=db_service,
                task_id=task_id,
                session_id=session_id,
                state="FAILED",
                state_reason="task_failed_permanent_error",
                error_message=f"{type(e).__name__}: {str(e)}",
                retryable=False,
            )
        except Exception as sync_err:
            logger.error(
                "failed_to_sync_session_failed_state task_id=%s session_id=%s error=%s",
                task_id,
                session_id,
                sync_err,
                exc_info=True,
            )

        # 不抛出异常，避免触发重试

    except Exception as e:
        # 未知错误：记录详细日志
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

        retries_left = 0
        try:
            current_job = get_current_job()
            retries_left = current_job.retries_left if current_job else 0
        except Exception as job_err:
            logger.error(
                f"Could not determine retries_left for task {task_id}: {job_err}; "
                "treating as retries exhausted"
            )

        if retries_left > 0:
            try:
                await db_service.increment_task_retry_count(task_id)
            except Exception as db_error:
                logger.error(f"Failed to increment retry count: {db_error}")
            raise

        await db_service.update_generation_task_status(
            task_id=task_id,
            status="failed",
            error_message=f"{type(e).__name__}: {str(e)}",
        )
        try:
            await _sync_session_terminal_state(
                db_service=db_service,
                task_id=task_id,
                session_id=session_id,
                state="FAILED",
                state_reason="task_failed_unknown_error",
                error_message=f"{type(e).__name__}: {str(e)}",
                retryable=True,
            )
        except Exception as sync_err:
            logger.error(
                "failed_to_sync_session_failed_state task_id=%s session_id=%s error=%s",
                task_id,
                session_id,
                sync_err,
                exc_info=True,
            )

        raise

    finally:
        if db_connected:
            try:
                # 避免 disconnect 挂住 worker，导致后续任务长期排队
                await asyncio.wait_for(db_service.disconnect(), timeout=5)
            except asyncio.TimeoutError:
                logger.warning(
                    f"Database disconnect timed out in task {task_id}; continue anyway"
                )
            except Exception as e:
                logger.warning(f"Failed to disconnect database in task {task_id}: {e}")


# ===========================================================================
# C1: RAG 索引任务（RQ 可恢复队列入口）
# ===========================================================================


def run_rag_indexing_task(
    file_id: str,
    project_id: str,
    session_id: Optional[str] = None,
):
    """
    同步包装函数，供 RQ worker 调用 RAG 索引任务。
    """
    asyncio.run(
        execute_rag_indexing_task(
            file_id=file_id,
            project_id=project_id,
            session_id=session_id,
        )
    )


async def execute_rag_indexing_task(
    file_id: str,
    project_id: str,
    session_id: Optional[str] = None,
):
    """
    执行 RAG 索引任务。

    Args:
        file_id: Upload 记录 ID
        project_id: 项目 ID
        session_id: 会话 ID（C5 数据隔离可选）
    """
    from services.database import DatabaseService
    from services.rag_indexing_service import index_upload_file_for_rag

    db = DatabaseService()
    db_connected = False
    try:
        await asyncio.wait_for(db.connect(), timeout=10)
        db_connected = True

        upload = await db.get_file(file_id)
        if not upload:
            logger.error("rag_indexing_task: file not found: %s", file_id)
            return

        await db.update_upload_status(upload.id, status="parsing")
        parse_result = await index_upload_file_for_rag(
            upload=upload,
            project_id=project_id,
            session_id=session_id,
            chunk_size=500,
            chunk_overlap=50,
            reindex=False,
        )
        await db.update_upload_status(
            upload.id,
            status="ready",
            parse_result=parse_result,
            error_message=None,
        )
        logger.info(
            "rag_indexing_task_completed",
            extra={"file_id": file_id, "project_id": project_id},
        )
    except Exception as e:
        logger.error(
            "rag_indexing_task_failed: file_id=%s error=%s",
            file_id,
            e,
            exc_info=True,
        )
        try:
            await db.update_upload_status(
                file_id, status="failed", error_message=str(e)
            )
        except Exception:
            pass
        raise
    finally:
        if db_connected:
            try:
                await asyncio.wait_for(db.disconnect(), timeout=5)
            except Exception:
                pass


async def _build_user_requirements(
    db_service,
    project_id: str,
    session_id: Optional[str] = None,
) -> str:
    """
    构建用户需求文本

    Args:
        project_id: 项目 ID

    Returns:
        用户需求文本
    """
    # 获取项目信息
    project = await db_service.get_project(project_id)
    if not project:
        return "生成课件"

    # 获取最近的聊天消息（C5: project_id + session_id 隔离）
    messages = await db_service.get_recent_conversation_messages(
        project_id=project_id,
        limit=10,
        session_id=session_id,
    )

    # 过滤出用户消息
    user_messages = [msg for msg in messages if msg.role == "user"]

    # 构建需求文本
    requirements_parts = [f"项目名称：{project.name}"]

    if project.description:
        requirements_parts.append(f"项目描述：{project.description}")

    if user_messages:
        requirements_parts.append("\n用户需求：")
        for msg in reversed(user_messages[-3:]):
            requirements_parts.append(f"- {msg.content}")

    return "\n".join(requirements_parts)
