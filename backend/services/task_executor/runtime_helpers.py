"""Helper functions extracted from generation runtime to keep hot paths focused."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Optional

from schemas.generation import (
    TaskStatus,
    build_task_output_urls,
    normalize_generation_type,
    requires_docx_output,
    requires_pptx_output,
)
from services.generation_session_service.session_history import (
    RUN_STATUS_COMPLETED,
    RUN_STEP_COMPLETED,
    update_session_run,
)
from services.platform.state_transition_guard import GenerationState

from .constants import TaskFailureStateReason

logger = logging.getLogger(__name__)


def _run_context_payload(context) -> dict:
    run_id = getattr(context, "run_id", None)
    retrieval_mode = getattr(context, "retrieval_mode", None)
    policy_version = getattr(context, "policy_version", None)
    baseline_id = getattr(context, "baseline_id", None)
    if not any([run_id, retrieval_mode, policy_version, baseline_id]):
        return {}
    return {
        "run_id": run_id,
        "run_no": getattr(context, "run_no", None),
        "run_title": getattr(context, "run_title", None),
        "tool_type": getattr(context, "tool_type", None),
        "retrieval_mode": retrieval_mode,
        "policy_version": policy_version,
        "baseline_id": baseline_id,
    }


def build_project_space_download_url(
    *,
    project_id: str,
    artifact_id: str,
) -> str:
    return f"/api/v1/projects/{project_id}/artifacts/{artifact_id}/download"


def _normalize_title_source(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    text = re.sub(r"\.(pptx?|docx?)$", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"\s+", "", text)
    return text


def _truncate_title(value: str, max_chars: int = 20) -> str:
    return str(value or "").strip()[:max_chars]


def _extract_content_title(courseware_content) -> str:
    if isinstance(courseware_content, dict):
        title = str(courseware_content.get("title") or "").strip()
        if title:
            return title
        slides = courseware_content.get("slides") or []
        if slides and isinstance(slides[0], dict):
            return str(slides[0].get("title") or "").strip()

    title = str(getattr(courseware_content, "title", "") or "").strip()
    if title:
        return title
    slides = getattr(courseware_content, "slides", None) or []
    if slides:
        first_slide = slides[0]
        if isinstance(first_slide, dict):
            return str(first_slide.get("title") or "").strip()
        return str(getattr(first_slide, "title", "") or "").strip()
    return ""


def _resolve_upload_course_name(upload_filename: str) -> str:
    normalized = _normalize_title_source(upload_filename)
    return _truncate_title(normalized, 20)


async def _resolve_course_name(db_service, context, project_id: str) -> str:
    project_name = ""
    if hasattr(db_service, "get_project"):
        try:
            project = await db_service.get_project(project_id)
            project_name = str(getattr(project, "name", "") or "").strip()
        except Exception:
            project_name = ""
    normalized_project = _truncate_title(_normalize_title_source(project_name), 20)
    if normalized_project:
        return normalized_project

    rag_source_ids = []
    if isinstance(getattr(context, "template_config", None), dict):
        rag_source_ids = list(context.template_config.get("rag_source_ids") or [])
    upload_model = getattr(getattr(db_service, "db", None), "upload", None)
    if upload_model is None:
        return "课程"

    if rag_source_ids and hasattr(upload_model, "find_many"):
        try:
            uploads = await upload_model.find_many(
                where={"projectId": project_id, "id": {"in": rag_source_ids}},
                select={"filename": True},
            )
        except Exception:
            uploads = []
        if uploads:
            filename = str(getattr(uploads[0], "filename", "") or "").strip()
            upload_course = _resolve_upload_course_name(filename)
            if upload_course:
                return upload_course

    if hasattr(upload_model, "find_first"):
        try:
            upload = await upload_model.find_first(
                where={"projectId": project_id},
                order={"createdAt": "desc"},
                select={"filename": True},
            )
        except Exception:
            upload = None
        if upload:
            filename = str(getattr(upload, "filename", "") or "").strip()
            upload_course = _resolve_upload_course_name(filename)
            if upload_course:
                return upload_course

    return "课程"


def _compose_ppt_title(
    *,
    course_name: str,
    knowledge_title: str,
    max_chars: int = 20,
) -> str:
    course = _normalize_title_source(course_name)
    knowledge = _normalize_title_source(knowledge_title)
    if course and knowledge.startswith(course):
        knowledge = knowledge[len(course) :].strip()
    if not knowledge:
        knowledge = "核心知识点"

    combined = f"{course}{knowledge}" if course else knowledge
    combined = _truncate_title(combined, max_chars)
    return combined or "课程核心知识点"


def _next_title_with_suffix(base_title: str, existing_titles: set[str]) -> str:
    if base_title not in existing_titles:
        return base_title
    for idx in range(1, 1000):
        candidate = _truncate_title(f"{base_title}{idx}", 20)
        if candidate not in existing_titles:
            return candidate
    return _truncate_title(f"{base_title}{int(time.time()) % 1000}", 20)


def _extract_metadata_title(artifact) -> str:
    raw = getattr(artifact, "metadata", None)
    parsed = {}
    if isinstance(raw, dict):
        parsed = raw
    elif isinstance(raw, str) and raw.strip():
        try:
            loaded = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            loaded = {}
        if isinstance(loaded, dict):
            parsed = loaded
    return str(parsed.get("title") or "").strip()


async def _resolve_ppt_artifact_title(
    *,
    db_service,
    context,
    project_id: str,
    courseware_content,
) -> str:
    course_name = await _resolve_course_name(db_service, context, project_id)
    knowledge_title = _extract_content_title(courseware_content)
    base_title = _compose_ppt_title(
        course_name=course_name,
        knowledge_title=knowledge_title,
        max_chars=20,
    )
    existing_titles: set[str] = set()
    if hasattr(db_service, "get_project_artifacts"):
        try:
            existing_artifacts = await db_service.get_project_artifacts(
                project_id=project_id,
                type_filter="pptx",
            )
        except Exception:
            existing_artifacts = []
        for item in existing_artifacts or []:
            title = _extract_metadata_title(item)
            if title:
                existing_titles.add(title[:20])
    return _next_title_with_suffix(base_title, existing_titles)


async def render_generation_outputs(
    db_service,
    context,
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
    context,
    artifact_paths: dict[str, str],
    courseware_content=None,
) -> dict[str, str]:
    if not context.session_id or not artifact_paths:
        return {}

    try:
        from services.database.prisma_compat import find_unique_with_select_fallback

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
    run_payload = _run_context_payload(context)
    ppt_title = await _resolve_ppt_artifact_title(
        db_service=db_service,
        context=context,
        project_id=project_id,
        courseware_content=courseware_content,
    )

    async def _persist_one(
        artifact_type: str,
        storage_path: str,
    ) -> tuple[str, str] | None:
        metadata_title = (
            ppt_title
            if artifact_type == "pptx"
            else (
                f"{ppt_title}教案"
                if artifact_type == "docx"
                else f"{artifact_type.upper()} · {context.task_id[:8]}"
            )
        )
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
                    "title": metadata_title[:120],
                    "task_id": context.task_id,
                    "is_current": True,
                    **run_payload,
                },
            )
            if run_payload.get("run_id"):
                await update_session_run(
                    db=db_service.db,
                    run_id=run_payload["run_id"],
                    artifact_id=artifact.id,
                )
            return artifact_type, build_project_space_download_url(
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
    context,
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
        run_payload = _run_context_payload(context)
        if run_payload.get("run_id"):
            await update_session_run(
                db=db_service.db,
                run_id=run_payload["run_id"],
                status=RUN_STATUS_COMPLETED,
                step=RUN_STEP_COMPLETED,
            )
        await sync_session_terminal_state(
            db_service=db_service,
            task_id=context.task_id,
            session_id=context.session_id,
            state=GenerationState.SUCCESS.value,
            state_reason=TaskFailureStateReason.COMPLETED.value,
            output_urls=output_urls,
            payload_extra={
                **(payload_extra or {}),
                **(
                    {
                        **run_payload,
                        "run_status": RUN_STATUS_COMPLETED,
                        "run_step": RUN_STEP_COMPLETED,
                    }
                    if run_payload.get("run_id")
                    else {}
                ),
            },
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
