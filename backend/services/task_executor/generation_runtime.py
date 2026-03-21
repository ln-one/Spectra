"""Helpers for generation task runtime orchestration."""

from __future__ import annotations

import asyncio
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
from services.database.prisma_compat import find_unique_with_select_fallback
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


def _build_project_space_download_url(
    *,
    project_id: str,
    artifact_id: str,
) -> str:
    return f"/api/v1/projects/{project_id}/artifacts/{artifact_id}/download"


async def build_generation_inputs(db_service, context: GenerationExecutionContext):
    from services.ai import ai_service

    user_requirements, outline_payload = await asyncio.gather(
        build_user_requirements(
            db_service,
            context.project_id,
            session_id=context.session_id,
            rag_source_ids=(
                context.template_config.get("rag_source_ids")
                if context.template_config
                else None
            ),
        ),
        load_session_outline(
            db_service,
            session_id=context.session_id,
        ),
    )
    outline_document, outline_version = outline_payload

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


def _extract_courseware_value(courseware_content, key: str) -> str:
    if isinstance(courseware_content, dict):
        value = courseware_content.get(key)
    else:
        value = getattr(courseware_content, key, None)
    return value if isinstance(value, str) else ""


async def cache_preview_content(task_id: str, courseware_content) -> dict:
    preview_payload = {
        "title": _extract_courseware_value(courseware_content, "title"),
        "markdown_content": _extract_courseware_value(
            courseware_content,
            "markdown_content",
        ),
        "lesson_plan_markdown": _extract_courseware_value(
            courseware_content,
            "lesson_plan_markdown",
        ),
    }
    try:
        from services.preview_helpers import save_preview_content

        await save_preview_content(task_id, preview_payload)
    except Exception as cache_err:
        logger.warning(
            "Failed to save preview cache for task %s: %s", task_id, cache_err
        )
    return preview_payload


async def persist_preview_payload(
    db_service,
    *,
    task_id: str,
    preview_payload: dict,
) -> None:
    """Persist preview payload into task inputData for cache-loss recovery."""
    try:
        task = await find_unique_with_select_fallback(
            model=db_service.db.generationtask,
            where={"id": task_id},
            select={"inputData": True},
        )
    except Exception as exc:
        logger.warning(
            "Failed to load generation task inputData for preview persistence: %s",
            exc,
        )
        return

    if task is None:
        return

    merged_input: dict = {}
    raw_input_data = getattr(task, "inputData", None)
    if raw_input_data:
        try:
            parsed_input_data = json.loads(raw_input_data)
        except (TypeError, json.JSONDecodeError):
            logger.warning(
                "Failed to parse task inputData as JSON for task %s",
                task_id,
            )
            parsed_input_data = None
        if isinstance(parsed_input_data, dict):
            merged_input.update(parsed_input_data)

    merged_input["preview_content"] = preview_payload
    merged_input["preview_cached_at"] = int(time.time())
    try:
        await db_service.db.generationtask.update(
            where={"id": task_id},
            data={"inputData": json.dumps(merged_input, ensure_ascii=False)},
        )
    except Exception as exc:
        logger.warning(
            "Failed to persist preview payload into task inputData for task %s: %s",
            task_id,
            exc,
        )


async def render_generation_outputs(
    db_service,
    context: GenerationExecutionContext,
    courseware_content,
) -> tuple[dict, dict, dict[str, float]]:
    from services.generation import generation_service
    from services.template import TemplateConfig

    tpl_config = (
        TemplateConfig(**context.template_config)
        if context.template_config
        else TemplateConfig()
    )
    output_urls = {}
    artifact_paths: dict[str, str] = {}
    render_timings_ms: dict[str, float] = {}
    should_emit_direct_output_urls = not bool(context.session_id)

    generation_type = normalize_generation_type(context.task_type)

    async def _generate_pptx_output() -> str:
        started_at = time.perf_counter()
        logger.info("Generating PPTX for task %s", context.task_id)
        pptx_path_local = await generation_service.generate_pptx(
            courseware_content, context.task_id, tpl_config
        )
        render_timings_ms["render_ppt_ms"] = round(
            (time.perf_counter() - started_at) * 1000,
            2,
        )
        logger.info(
            "PPTX generated for task %s in %.2fs: %s",
            context.task_id,
            time.perf_counter() - started_at,
            pptx_path_local,
        )
        return pptx_path_local

    async def _generate_docx_output() -> str:
        started_at = time.perf_counter()
        logger.info("Generating DOCX for task %s", context.task_id)
        docx_path_local = await generation_service.generate_docx(
            courseware_content, context.task_id, tpl_config
        )
        render_timings_ms["render_word_ms"] = round(
            (time.perf_counter() - started_at) * 1000,
            2,
        )
        logger.info(
            "DOCX generated for task %s in %.2fs: %s",
            context.task_id,
            time.perf_counter() - started_at,
            docx_path_local,
        )
        return docx_path_local

    need_pptx = requires_pptx_output(generation_type)
    need_docx = requires_docx_output(generation_type)

    if need_pptx and need_docx:
        logger.info(
            "Generating PPTX and DOCX in parallel for task %s",
            context.task_id,
        )
        pptx_path, docx_path = await asyncio.gather(
            _generate_pptx_output(),
            _generate_docx_output(),
        )
        artifact_paths["pptx"] = pptx_path
        artifact_paths["docx"] = docx_path
        if should_emit_direct_output_urls:
            output_urls.update(
                build_task_output_urls(
                    pptx_url=pptx_path,
                    docx_url=docx_path,
                )
            )
        await db_service.update_generation_task_status(
            context.task_id, TaskStatus.PROCESSING, 90
        )

    if need_pptx and not need_docx:
        pptx_path = await _generate_pptx_output()
        artifact_paths["pptx"] = pptx_path
        if should_emit_direct_output_urls:
            output_urls.update(build_task_output_urls(pptx_url=pptx_path))
        await db_service.update_generation_task_status(
            context.task_id, TaskStatus.PROCESSING, 60
        )

    if need_docx and not need_pptx:
        docx_path = await _generate_docx_output()
        artifact_paths["docx"] = docx_path
        if should_emit_direct_output_urls:
            output_urls.update(build_task_output_urls(docx_url=docx_path))
        await db_service.update_generation_task_status(
            context.task_id, TaskStatus.PROCESSING, 90
        )

    return output_urls, artifact_paths, render_timings_ms


async def persist_generation_artifacts(
    db_service,
    context: GenerationExecutionContext,
    artifact_paths: dict[str, str],
) -> dict[str, str]:
    if not context.session_id:
        return {}
    if not artifact_paths:
        return {}

    try:
        session = await find_unique_with_select_fallback(
            model=db_service.db.generationsession,
            where={"id": context.session_id},
            select={
                "userId": True,
                "baseVersionId": True,
                "projectId": True,
            },
        )
    except Exception as exc:
        logger.warning(
            "skip_persist_generation_artifacts session lookup failed: %s",
            exc,
        )
        return {}

    if not session:
        return {}

    user_id = getattr(session, "userId", None)
    base_version_id = getattr(session, "baseVersionId", None)
    project_id = getattr(session, "projectId", None) or context.project_id
    output_urls: dict[str, str] = {}

    async def _persist_one(
        artifact_type: str,
        storage_path: str,
    ) -> tuple[str, str] | None:
        try:
            artifact = await db_service.create_artifact(
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
            return artifact_type, _build_project_space_download_url(
                project_id=project_id,
                artifact_id=artifact.id,
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
            return None

    results = await asyncio.gather(
        *(
            _persist_one(artifact_type, storage_path)
            for artifact_type, storage_path in artifact_paths.items()
        )
    )
    for item in results:
        if not item:
            continue
        artifact_type, url = item
        output_urls[artifact_type] = url
    return output_urls


async def finalize_generation_success(
    db_service,
    context: GenerationExecutionContext,
    output_urls: dict,
    payload_extra: Optional[dict] = None,
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
            payload_extra=payload_extra,
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
            **(payload_extra or {}),
            "execution_time": time.time() - context.start_time,
            "timestamp": time.time(),
        },
    )
