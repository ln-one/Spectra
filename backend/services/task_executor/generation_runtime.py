"""Helpers for generation task runtime orchestration."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from schemas.generation import (
    TaskStatus,
    build_task_output_urls,
    normalize_generation_type,
    requires_docx_output,
    requires_pptx_output,
)
from services.platform.state_transition_guard import GenerationState

from .constants import TaskFailureStateReason
from .requirements import build_user_requirements, load_session_outline

logger = logging.getLogger(__name__)


@dataclass
class GenerationExecutionContext:
    task_id: str
    project_id: str
    task_type: str
    template_config: Optional[dict]
    start_time: float = field(default_factory=time.time)
    session_id: Optional[str] = None


async def build_generation_inputs(db_service, context: GenerationExecutionContext):
    from services.ai import ai_service

    user_requirements = await build_user_requirements(
        db_service,
        context.project_id,
        session_id=context.session_id,
        rag_source_ids=(
            context.template_config.get("rag_source_ids")
            if context.template_config
            else None
        ),
    )
    outline_document, outline_version = await load_session_outline(
        db_service,
        session_id=context.session_id,
    )

    courseware_content = await ai_service.generate_courseware_content(
        project_id=context.project_id,
        user_requirements=user_requirements,
        template_style=(
            context.template_config.get("style", "default")
            if context.template_config
            else "default"
        ),
        outline_document=outline_document,
        outline_version=outline_version,
        session_id=context.session_id,
        rag_source_ids=(
            context.template_config.get("rag_source_ids")
            if context.template_config
            else None
        ),
    )
    return courseware_content


async def cache_preview_content(task_id: str, courseware_content) -> None:
    try:
        from services.preview_helpers import save_preview_content

        await save_preview_content(
            task_id,
            {
                "title": courseware_content.title,
                "markdown_content": courseware_content.markdown_content,
                "lesson_plan_markdown": courseware_content.lesson_plan_markdown,
            },
        )
    except Exception as cache_err:
        logger.warning(
            "Failed to save preview cache for task %s: %s", task_id, cache_err
        )


async def render_generation_outputs(
    db_service,
    context: GenerationExecutionContext,
    courseware_content,
) -> tuple[dict, dict]:
    from services.generation import generation_service
    from services.template import TemplateConfig

    tpl_config = (
        TemplateConfig(**context.template_config)
        if context.template_config
        else TemplateConfig()
    )
    output_urls = {}
    artifact_paths: dict[str, str] = {}
    export_endpoint = (
        f"/api/v1/generate/sessions/{context.session_id}/preview/export"
        if context.session_id
        else None
    )

    generation_type = normalize_generation_type(context.task_type)

    if requires_pptx_output(generation_type):
        logger.info("Generating PPTX for task %s", context.task_id)
        pptx_path = await generation_service.generate_pptx(
            courseware_content, context.task_id, tpl_config
        )
        logger.info("PPTX generated: %s", pptx_path)
        artifact_paths["pptx"] = pptx_path
        output_urls.update(
            build_task_output_urls(pptx_url=export_endpoint or pptx_path)
        )
        await db_service.update_generation_task_status(
            context.task_id, TaskStatus.PROCESSING, 60
        )

    if requires_docx_output(generation_type):
        logger.info("Generating DOCX for task %s", context.task_id)
        docx_path = await generation_service.generate_docx(
            courseware_content, context.task_id, tpl_config
        )
        logger.info("DOCX generated: %s", docx_path)
        artifact_paths["docx"] = docx_path
        output_urls.update(
            build_task_output_urls(docx_url=export_endpoint or docx_path)
        )
        await db_service.update_generation_task_status(
            context.task_id, TaskStatus.PROCESSING, 90
        )

    return output_urls, artifact_paths


async def persist_generation_artifacts(
    db_service,
    context: GenerationExecutionContext,
    artifact_paths: dict[str, str],
) -> None:
    if not context.session_id:
        return
    if not artifact_paths:
        return

    try:
        session = await db_service.db.generationsession.find_unique(
            where={"id": context.session_id}
        )
    except Exception as exc:
        logger.warning(
            "skip_persist_generation_artifacts session lookup failed: %s",
            exc,
        )
        return

    if not session:
        return

    user_id = getattr(session, "userId", None)
    base_version_id = getattr(session, "baseVersionId", None)
    project_id = getattr(session, "projectId", None) or context.project_id

    for artifact_type, storage_path in artifact_paths.items():
        try:
            await db_service.create_artifact(
                project_id=project_id,
                artifact_type=artifact_type,
                visibility="private",
                session_id=context.session_id,
                based_on_version_id=base_version_id,
                owner_user_id=user_id,
                storage_path=storage_path,
                metadata={
                    "mode": "create",
                    "status": "completed",
                    "output_type": "ppt" if artifact_type == "pptx" else "word",
                    "title": f"{artifact_type.upper()} · {context.task_id[:8]}",
                    "task_id": context.task_id,
                    "is_current": True,
                },
            )
        except Exception as exc:
            logger.warning(
                "persist_generation_artifact_failed task_id=%s session_id=%s "
                "artifact_type=%s error=%s",
                context.task_id,
                context.session_id,
                artifact_type,
                exc,
            )


async def finalize_generation_success(
    db_service,
    context: GenerationExecutionContext,
    output_urls: dict,
) -> None:
    from .common import sync_session_terminal_state

    await db_service.update_generation_task_status(
        task_id=context.task_id,
        status=TaskStatus.COMPLETED,
        progress=100,
        output_urls=json.dumps(output_urls),
    )

    try:
        await sync_session_terminal_state(
            db_service=db_service,
            task_id=context.task_id,
            session_id=context.session_id,
            state=GenerationState.SUCCESS.value,
            state_reason=TaskFailureStateReason.COMPLETED.value,
            output_urls=output_urls,
        )
        if context.session_id:
            logger.info(
                "session_state_updated_to_success",
                extra={
                    "session_id": context.session_id,
                    "task_id": context.task_id,
                    "timestamp": time.time(),
                },
            )
    except Exception as sync_err:
        logger.error(
            "failed_to_sync_session_success_state " "task_id=%s session_id=%s error=%s",
            context.task_id,
            context.session_id,
            sync_err,
            exc_info=True,
        )

    logger.info(
        "generation_task_completed",
        extra={
            "task_id": context.task_id,
            "project_id": context.project_id,
            "output_urls": output_urls,
            "execution_time": time.time() - context.start_time,
            "timestamp": time.time(),
        },
    )
