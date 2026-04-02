from __future__ import annotations

import json

from services.generation import generation_service
from services.generation.types import CoursewareContent
from services.generation_session_service.session_history import (
    RUN_STATUS_COMPLETED,
    RUN_STEP_COMPLETED,
    serialize_session_run,
    update_session_run,
)
from services.preview_helpers.rendered_preview import build_rendered_preview_payload
from services.preview_helpers.rendering import build_slides
from services.task_executor.runtime_helpers import build_project_space_download_url
from services.template import TemplateConfig


def coerce_positive_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value >= 1:
        return value
    if isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
        return parsed if parsed >= 1 else None
    return None


def slide_identity(slide, fallback_index: int) -> str:
    value = getattr(slide, "id", None)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return f"slide-{fallback_index}"


def resolve_target_slide_index(command: dict) -> int | None:
    slide_index = coerce_positive_int(command.get("slide_index"))
    if slide_index is not None:
        return slide_index

    slide_id = str(command.get("slide_id") or "").strip()
    if not slide_id:
        return None
    markdown_content = str(command.get("_preview_markdown_content") or "")
    if not markdown_content.strip():
        return None

    slides = build_slides("preview", markdown_content)
    for slide in slides:
        if str(getattr(slide, "id", "") or "").strip() == slide_id:
            resolved = int(getattr(slide, "index", -1)) + 1
            return resolved if resolved >= 1 else None
    return None


def extract_template_config(*, session, task) -> dict | None:
    def _load_json(raw: object) -> dict:
        if not isinstance(raw, str) or not raw.strip():
            return {}
        try:
            parsed = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}

    session_options = _load_json(getattr(session, "options", None))
    if isinstance(session_options.get("template_config"), dict):
        return session_options.get("template_config")

    task_input = _load_json(getattr(task, "inputData", None))
    if isinstance(task_input.get("template_config"), dict):
        return task_input.get("template_config")

    task_template = _load_json(getattr(task, "templateConfig", None))
    return task_template or None


async def refresh_rendered_preview(
    *,
    task,
    preview_payload: dict,
    template_config: dict | None,
) -> dict:
    slide_models = build_slides(
        task.id,
        str(preview_payload.get("markdown_content") or ""),
    )
    rendered_preview = await build_rendered_preview_payload(
        task_id=task.id,
        title=str(preview_payload.get("title") or ""),
        markdown_content=str(preview_payload.get("markdown_content") or ""),
        template_config=template_config,
        slide_ids=[
            slide_identity(slide, index) for index, slide in enumerate(slide_models)
        ],
        style_manifest=preview_payload.get("style_manifest"),
        extra_css=preview_payload.get("extra_css"),
        page_class_plan=preview_payload.get("page_class_plan"),
    )
    next_payload = dict(preview_payload)
    next_payload["rendered_preview"] = rendered_preview
    return next_payload


async def persist_modified_pptx_artifact(
    *,
    db,
    session,
    task,
    run,
    preview_payload: dict,
    template_config: dict | None,
    render_version: int,
) -> tuple[str | None, dict]:
    markdown_content = str(preview_payload.get("markdown_content") or "").strip()
    if not markdown_content:
        return None, {}
    artifact_model = getattr(db, "artifact", None)
    if artifact_model is None or not hasattr(artifact_model, "create"):
        if run:
            await update_session_run(
                db=db,
                run_id=run.id,
                status=RUN_STATUS_COMPLETED,
                step=RUN_STEP_COMPLETED,
            )
        return None, {}

    courseware = CoursewareContent(
        title=str(preview_payload.get("title") or "璇句欢棰勮"),
        markdown_content=markdown_content,
        lesson_plan_markdown=str(preview_payload.get("lesson_plan_markdown") or ""),
    )
    normalized_template = (
        TemplateConfig(**template_config) if template_config is not None else None
    )
    render_task_id = f"{task.id}-rv{render_version}"
    pptx_path = await generation_service.generate_pptx(
        courseware,
        render_task_id,
        normalized_template,
    )

    artifact = await db.artifact.create(
        data={
            "projectId": session.projectId,
            "type": "pptx",
            "visibility": "private",
            "sessionId": session.id,
            "basedOnVersionId": getattr(session, "baseVersionId", None),
            "ownerUserId": getattr(session, "userId", None),
            "storagePath": pptx_path,
            "metadata": json.dumps(
                {
                    "mode": "modify",
                    "status": "completed",
                    "output_type": "ppt",
                    "title": f"PPTX 路 slide modify 路 {render_task_id[:16]}",
                    "task_id": render_task_id,
                    "source_task_id": task.id,
                    "is_current": True,
                    **(serialize_session_run(run) or {}),
                },
                ensure_ascii=False,
            ),
        }
    )
    output_urls = {
        "pptx": build_project_space_download_url(
            project_id=session.projectId,
            artifact_id=artifact.id,
        )
    }
    if run:
        await update_session_run(
            db=db,
            run_id=run.id,
            artifact_id=artifact.id,
            status=RUN_STATUS_COMPLETED,
            step=RUN_STEP_COMPLETED,
        )
    return artifact.id, output_urls


def extract_rag_source_ids(*, session, task) -> list[str]:
    source_ids: list[str] = []

    def _merge(raw_value: object) -> None:
        if not isinstance(raw_value, list):
            return
        for item in raw_value:
            normalized = str(item or "").strip()
            if normalized and normalized not in source_ids:
                source_ids.append(normalized)

    options_raw = getattr(session, "options", None)
    if isinstance(options_raw, str) and options_raw.strip():
        try:
            options = json.loads(options_raw)
        except (TypeError, json.JSONDecodeError):
            options = None
        if isinstance(options, dict):
            _merge(options.get("rag_source_ids"))
            template_config = (
                options.get("template_config")
                if isinstance(options.get("template_config"), dict)
                else {}
            )
            _merge(template_config.get("rag_source_ids"))

    input_data_raw = getattr(task, "inputData", None)
    if isinstance(input_data_raw, str) and input_data_raw.strip():
        try:
            input_data = json.loads(input_data_raw)
        except (TypeError, json.JSONDecodeError):
            input_data = None
        if isinstance(input_data, dict):
            _merge(input_data.get("rag_source_ids"))
            template_config = (
                input_data.get("template_config")
                if isinstance(input_data.get("template_config"), dict)
                else {}
            )
            _merge(template_config.get("rag_source_ids"))

    return source_ids
