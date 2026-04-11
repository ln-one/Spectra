from __future__ import annotations

import json

from services.generation_session_service.capability_helpers import (
    resolve_template_config_from_options_dict,
)
from services.generation_session_service.session_history import (
    RUN_STATUS_COMPLETED,
    RUN_STEP_COMPLETED,
    serialize_session_run,
    update_session_run,
)
from services.preview_helpers.rendered_preview import build_rendered_preview_payload
from services.preview_helpers.rendering import build_slides
from services.preview_helpers.slide_mapping import (
    build_slide_id_index_map,
    resolve_slide_index,
    slide_identity,
)
from services.render_engine_adapter import (
    build_render_engine_input,
    invoke_render_engine,
    normalize_render_engine_result,
)
from services.task_executor.runtime_helpers import build_project_space_download_url


def resolve_target_slide_index(
    command: dict,
    *,
    preview_payload: dict | None = None,
    render_job_id: str | None = None,
) -> int | None:
    payload = preview_payload if isinstance(preview_payload, dict) else {}
    resolved_render_job_id = (
        str(render_job_id or payload.get("render_job_id") or "").strip() or "preview"
    )
    markdown_content = str(
        command.get("_preview_markdown_content")
        or payload.get("markdown_content")
        or ""
    )
    render_markdown = str(
        command.get("_preview_render_markdown") or payload.get("render_markdown") or ""
    )
    image_metadata = payload.get("_image_metadata")
    if not isinstance(image_metadata, dict):
        image_metadata = None
    rendered_preview = payload.get("rendered_preview")
    if not isinstance(rendered_preview, dict):
        rendered_preview = None

    slide_id_index_map = build_slide_id_index_map(
        task_id=resolved_render_job_id,
        markdown_content=markdown_content,
        image_metadata=image_metadata,
        render_markdown=render_markdown,
        rendered_preview=rendered_preview,
    )

    return resolve_slide_index(
        slide_id=command.get("slide_id"),
        slide_index=command.get("slide_index"),
        slide_id_index_map=slide_id_index_map,
    )


def extract_template_config(
    *,
    session,
    artifact_metadata: dict | None = None,
    run_data: dict | None = None,
) -> dict | None:
    def _load_json(raw: object) -> dict:
        if not isinstance(raw, str) or not raw.strip():
            return {}
        try:
            parsed = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}

    session_options = _load_json(getattr(session, "options", None))
    session_template_config = resolve_template_config_from_options_dict(session_options)
    if session_template_config:
        return session_template_config

    if isinstance(run_data, dict):
        run_template_config = resolve_template_config_from_options_dict(run_data)
        if run_template_config:
            return run_template_config

    artifact_template = (
        artifact_metadata.get("template_config")
        if isinstance(artifact_metadata, dict)
        else None
    )
    return artifact_template if isinstance(artifact_template, dict) else None


async def refresh_rendered_preview(
    *,
    render_job_id: str,
    preview_payload: dict,
    template_config: dict | None,
) -> dict:
    resolved_render_job_id = str(render_job_id or "").strip() or "preview"
    render_markdown = (
        str(preview_payload.get("render_markdown") or "")
        if isinstance(preview_payload, dict)
        else ""
    )
    image_metadata = (
        preview_payload.get("_image_metadata")
        if isinstance(preview_payload, dict)
        else None
    )
    if not isinstance(image_metadata, dict):
        image_metadata = None
    slide_models = build_slides(
        resolved_render_job_id,
        str(preview_payload.get("markdown_content") or ""),
        image_metadata,
        render_markdown,
    )
    rendered_preview = await build_rendered_preview_payload(
        task_id=resolved_render_job_id,
        title=str(preview_payload.get("title") or ""),
        markdown_content=str(preview_payload.get("markdown_content") or ""),
        template_config=template_config,
        slide_ids=[
            slide_identity(slide, index, task_id=resolved_render_job_id)
            for index, slide in enumerate(slide_models)
        ],
        render_markdown=render_markdown,
        style_manifest=preview_payload.get("style_manifest"),
        extra_css=preview_payload.get("extra_css"),
        page_class_plan=preview_payload.get("page_class_plan"),
    )
    next_payload = dict(preview_payload)
    if isinstance(rendered_preview, dict):
        resolved_markdown_content = rendered_preview.pop(
            "_resolved_markdown_content", None
        )
        if (
            isinstance(resolved_markdown_content, str)
            and resolved_markdown_content.strip()
        ):
            next_payload["resolved_markdown_content"] = resolved_markdown_content
    next_payload["render_job_id"] = resolved_render_job_id
    next_payload["rendered_preview"] = rendered_preview
    return next_payload


async def persist_modified_pptx_artifact(
    *,
    db,
    session,
    render_job_id: str,
    source_artifact_id: str | None,
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

    resolved_render_job_id = str(render_job_id or "").strip() or f"session-{session.id}"
    render_artifact_job_id = f"{resolved_render_job_id}-rv{render_version}"
    render_input = build_render_engine_input(
        {
            "title": str(preview_payload.get("title") or "课件预览"),
            "markdown_content": markdown_content,
            "lesson_plan_markdown": str(
                preview_payload.get("lesson_plan_markdown") or ""
            ),
            "render_markdown": str(preview_payload.get("render_markdown") or ""),
            "style_manifest": preview_payload.get("style_manifest"),
            "extra_css": preview_payload.get("extra_css"),
            "page_class_plan": preview_payload.get("page_class_plan"),
        },
        template_config,
        ["pptx"],
        render_job_id=render_artifact_job_id,
    )
    render_result = await invoke_render_engine(render_input)
    normalized_result = normalize_render_engine_result(render_result)
    pptx_path = str(
        (normalized_result.get("artifact_paths") or {}).get("pptx") or ""
    ).strip()
    if not pptx_path:
        raise RuntimeError("render_engine_missing_pptx_artifact")

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
                    "title": f"PPTX 路 slide modify 路 {render_artifact_job_id[:16]}",
                    "render_job_id": render_artifact_job_id,
                    "source_artifact_id": source_artifact_id,
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


def extract_rag_source_ids(
    *,
    session,
    artifact_metadata: dict | None = None,
    run_data: dict | None = None,
) -> list[str]:
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

    if isinstance(run_data, dict):
        _merge(run_data.get("rag_source_ids"))
        template_config = (
            run_data.get("template_config")
            if isinstance(run_data.get("template_config"), dict)
            else {}
        )
        _merge(template_config.get("rag_source_ids"))

    if isinstance(artifact_metadata, dict):
        _merge(artifact_metadata.get("rag_source_ids"))
        artifact_template = (
            artifact_metadata.get("template_config")
            if isinstance(artifact_metadata.get("template_config"), dict)
            else {}
        )
        _merge(artifact_template.get("rag_source_ids"))

    return source_ids
