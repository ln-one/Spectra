from __future__ import annotations

from typing import Any

from services.generation_session_service.animation_contract import (
    resolve_animation_contract,
)
from utils.exceptions import APIException, ErrorCode


def _ensure_runtime_snapshot_compiled(snapshot: dict[str, Any]) -> None:
    compile_status = str(snapshot.get("compile_status") or "").strip().lower()
    compile_errors = snapshot.get("compile_errors")
    runtime_validation_report = snapshot.get("runtime_validation_report")
    has_compile_errors = isinstance(compile_errors, list) and len(compile_errors) > 0
    if compile_status != "error" and not has_compile_errors:
        return
    raise APIException(
        status_code=422,
        error_code=ErrorCode.INVALID_INPUT,
        message="Animation runtime graph compile/validation failed.",
        details={
            "error_code": "ANIMATION_RUNTIME_COMPILE_FAILED",
            "invalid_field": "runtime_graph",
            "invalid_value": "compile_error",
            "compile_status": compile_status or "error",
            "compile_errors": compile_errors if isinstance(compile_errors, list) else [],
            "runtime_validation_report": (
                runtime_validation_report
                if isinstance(runtime_validation_report, list)
                else []
            ),
        },
    )


def normalize_speaker_notes_payload(
    payload: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    raw_slides = payload.get("slides") if isinstance(payload.get("slides"), list) else []
    normalized_slides: list[dict[str, Any]] = []
    anchors: list[dict[str, Any]] = []
    source_artifact_id = str(
        payload.get("source_artifact_id") or config.get("source_artifact_id") or ""
    ).strip()

    for slide_index, raw_slide in enumerate(raw_slides, start=1):
        if not isinstance(raw_slide, dict):
            continue
        page = int(raw_slide.get("page") or slide_index)
        slide_id = str(raw_slide.get("id") or f"slide-{page}").strip() or f"slide-{page}"
        slide_title = str(raw_slide.get("title") or f"第 {page} 页").strip() or f"第 {page} 页"
        sections_raw = raw_slide.get("sections")
        if not isinstance(sections_raw, list) or not sections_raw:
            sections_raw = [
                {
                    "title": "讲解内容",
                    "paragraphs": [
                        {
                            "text": str(raw_slide.get("script") or raw_slide.get("summary") or "").strip(),
                            "role": "script",
                        },
                        {
                            "text": str(raw_slide.get("action_hint") or "").strip(),
                            "role": "action_hint",
                        },
                        {
                            "text": str(raw_slide.get("transition_line") or "").strip(),
                            "role": "transition",
                        },
                    ],
                }
            ]
        normalized_sections: list[dict[str, Any]] = []
        paragraph_counter = 0
        for section_index, raw_section in enumerate(sections_raw, start=1):
            if not isinstance(raw_section, dict):
                continue
            section_id = (
                str(raw_section.get("id") or f"{slide_id}-section-{section_index}").strip()
                or f"{slide_id}-section-{section_index}"
            )
            section_title = (
                str(raw_section.get("title") or f"段落 {section_index}").strip()
                or f"段落 {section_index}"
            )
            raw_paragraphs = raw_section.get("paragraphs")
            if not isinstance(raw_paragraphs, list):
                raw_paragraphs = []
            normalized_paragraphs: list[dict[str, Any]] = []
            for raw_paragraph in raw_paragraphs:
                if not isinstance(raw_paragraph, dict):
                    continue
                text = str(raw_paragraph.get("text") or "").strip()
                if not text:
                    continue
                paragraph_counter += 1
                paragraph_id = f"{slide_id}-paragraph-{paragraph_counter}"
                anchor_id = f"speaker_notes:v2:{slide_id}:paragraph-{paragraph_counter}"
                role = str(raw_paragraph.get("role") or "script").strip() or "script"
                normalized_paragraphs.append(
                    {
                        "id": paragraph_id,
                        "anchor_id": anchor_id,
                        "text": text,
                        "role": role,
                    }
                )
                anchors.append(
                    {
                        "scope": "paragraph",
                        "anchor_id": anchor_id,
                        "slide_id": slide_id,
                        "paragraph_id": paragraph_id,
                        "label": f"第 {page} 页{section_title}",
                    }
                )
            if normalized_paragraphs:
                normalized_sections.append(
                    {
                        "id": section_id,
                        "title": section_title,
                        "paragraphs": normalized_paragraphs,
                    }
                )
        if not normalized_sections:
            continue
        anchors.append(
            {
                "scope": "page",
                "anchor_id": f"speaker_notes:v2:{slide_id}:page",
                "slide_id": slide_id,
                "label": f"第 {page} 页",
            }
        )
        normalized_slides.append(
            {
                "id": slide_id,
                "page": page,
                "title": slide_title,
                "sections": normalized_sections,
            }
        )

    summary = str(payload.get("summary") or "").strip()
    if not summary and normalized_slides:
        summary = f"已生成 {len(normalized_slides)} 页逐页说课讲稿。"

    return {
        "kind": "speaker_notes",
        "schema_version": "speaker_notes.v2",
        "title": str(payload.get("title") or config.get("topic") or "说课讲稿").strip()
        or "说课讲稿",
        "summary": summary,
        "source_artifact_id": source_artifact_id or None,
        "slides": normalized_slides,
        "anchors": anchors,
    }


async def normalize_demonstration_animation_payload(
    payload: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    from services.artifact_generator.animation_runtime import (
        enrich_animation_runtime_snapshot_async,
    )
    from services.artifact_generator.animation_spec import normalize_animation_spec

    merged_animation_payload = dict(payload)
    merged_animation_payload.setdefault("kind", "animation_storyboard")
    if config.get("topic") and not merged_animation_payload.get("topic"):
        merged_animation_payload["topic"] = config.get("topic")
    if config.get("motion_brief") and not merged_animation_payload.get("focus"):
        merged_animation_payload["focus"] = config.get("motion_brief")
    if config.get("duration_seconds"):
        merged_animation_payload["duration_seconds"] = config.get("duration_seconds")
    if config.get("rhythm"):
        merged_animation_payload["rhythm"] = config.get("rhythm")
    if config.get("style_pack"):
        merged_animation_payload["style_pack"] = config.get("style_pack")
    if config.get("visual_type"):
        merged_animation_payload["visual_type"] = config.get("visual_type")

    if "use_deterministic_algorithm_seed" in config:
        merged_animation_payload["use_deterministic_algorithm_seed"] = bool(
            config.get("use_deterministic_algorithm_seed")
        )

    normalized = normalize_animation_spec(merged_animation_payload)
    enriched = await enrich_animation_runtime_snapshot_async(normalized)
    _ensure_runtime_snapshot_compiled(enriched)
    resolved_contract = resolve_animation_contract(
        config=config,
        payload=merged_animation_payload,
        default_format="html5",
    )
    enriched["format"] = resolved_contract.animation_format
    enriched["animation_format"] = resolved_contract.animation_format
    enriched["render_mode"] = resolved_contract.render_mode
    enriched["placement_supported"] = resolved_contract.placement_supported
    enriched["runtime_preview_mode"] = "local_preview_only"
    for legacy_key in (
        "cloud_video_provider",
        "cloud_video_model",
        "cloud_video_resolution",
        "cloud_video_watermark",
    ):
        enriched.pop(legacy_key, None)
    return enriched
