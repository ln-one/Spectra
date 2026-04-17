"""Pagevra bridge for generation runtime output rendering."""

from __future__ import annotations

import logging
import time

from schemas.generation import (
    TaskStatus,
    build_task_output_urls,
    normalize_generation_type,
    requires_docx_output,
    requires_pptx_output,
)

logger = logging.getLogger(__name__)


async def _load_authority_output_urls(
    db_service,
    context,
    requested_targets: list[str],
) -> dict[str, str]:
    if not getattr(context, "session_id", None):
        return {}
    session_model = getattr(db_service.db, "generationsession", None)
    if session_model is None or not hasattr(session_model, "find_unique"):
        return {}
    session = await session_model.find_unique(where={"id": context.session_id})
    if not session:
        return {}

    ppt_url = str(getattr(session, "pptUrl", "") or "").strip()
    word_url = str(getattr(session, "wordUrl", "") or "").strip()
    output_urls = build_task_output_urls(
        pptx_url=ppt_url or None if "pptx" in requested_targets else None,
        docx_url=word_url or None if "docx" in requested_targets else None,
    )
    return {key: value for key, value in output_urls.items() if value}


async def render_generation_outputs(
    db_service,
    context,
    courseware_content,
) -> tuple[dict, dict, dict[str, float], dict[str, str]]:
    from services.render_engine_adapter import (
        build_render_engine_input,
        invoke_render_engine,
        normalize_render_engine_result,
    )

    output_urls = {}
    artifact_paths: dict[str, str] = {}
    render_timings_ms: dict[str, float] = {}
    render_metadata: dict[str, str] = {}
    should_emit_direct_output_urls = not bool(context.session_id)

    generation_type = normalize_generation_type(context.task_type)
    requested_targets: list[str] = []
    if requires_pptx_output(generation_type):
        requested_targets.append("pptx")
    if requires_docx_output(generation_type):
        requested_targets.append("docx")

    if not requested_targets:
        return output_urls, artifact_paths, render_timings_ms, render_metadata

    authority_output_urls = await _load_authority_output_urls(
        db_service,
        context,
        requested_targets,
    )
    if authority_output_urls:
        render_metadata["output_source"] = "authority_artifact"
        render_timings_ms["render_engine_ms"] = 0.0
        output_urls.update(authority_output_urls)
        logger.info(
            "Render outputs reused authority artifact for task %s: targets=%s",
            context.task_id,
            requested_targets,
        )
        if requested_targets == ["pptx"]:
            await db_service.update_generation_task_status(
                context.task_id, TaskStatus.PROCESSING, 60
            )
        else:
            await db_service.update_generation_task_status(
                context.task_id, TaskStatus.PROCESSING, 90
            )
        return output_urls, artifact_paths, render_timings_ms, render_metadata

    started_at = time.perf_counter()
    render_input = build_render_engine_input(
        courseware_content,
        context.template_config if isinstance(context.template_config, dict) else {},
        requested_targets,
        render_job_id=context.task_id,
    )
    render_result = await invoke_render_engine(render_input)
    normalized_result = normalize_render_engine_result(render_result)
    artifact_paths.update(normalized_result["artifact_paths"])
    markdown_content = normalized_result.get("markdown")
    if isinstance(markdown_content, str) and markdown_content.strip():
        render_metadata["resolved_markdown_content"] = markdown_content
    markdown_path = normalized_result.get("markdown_path")
    if isinstance(markdown_path, str) and markdown_path.strip():
        render_metadata["resolved_markdown_path"] = markdown_path
    metrics = normalized_result.get("metrics") or {}
    if "pptx" in artifact_paths:
        render_timings_ms["render_ppt_ms"] = round(
            float(metrics.get("render_ms") or 0.0),
            2,
        )
    if "docx" in artifact_paths:
        render_timings_ms["render_word_ms"] = round(
            float(metrics.get("render_ms") or 0.0),
            2,
        )
    render_timings_ms["render_engine_ms"] = round(
        (time.perf_counter() - started_at) * 1000,
        2,
    )
    if should_emit_direct_output_urls:
        output_urls.update(
            build_task_output_urls(
                pptx_url=artifact_paths.get("pptx"),
                docx_url=artifact_paths.get("docx"),
            )
        )
    logger.info(
        "Render engine generated outputs for task %s: targets=%s warnings=%s",
        context.task_id,
        requested_targets,
        len(normalized_result.get("warnings") or []),
    )
    if requested_targets == ["pptx"]:
        await db_service.update_generation_task_status(
            context.task_id, TaskStatus.PROCESSING, 60
        )
    else:
        await db_service.update_generation_task_status(
            context.task_id, TaskStatus.PROCESSING, 90
        )
    return output_urls, artifact_paths, render_timings_ms, render_metadata
