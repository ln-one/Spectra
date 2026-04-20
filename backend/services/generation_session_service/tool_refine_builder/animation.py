"""Animation storyboard structured refine."""

from __future__ import annotations

import copy
from typing import Any

from services.generation_session_service.animation_contract import (
    resolve_animation_contract,
)
from utils.exceptions import APIException, ErrorCode

from .common import _load_rag_snippets


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


async def refine_animation_content(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
    project_id: str,
    rag_source_ids: list[str] | None,
) -> dict[str, Any]:
    from services.artifact_generator.animation_runtime import (
        enrich_animation_runtime_snapshot_async,
    )
    from services.artifact_generator.animation_spec import normalize_animation_spec
    from services.artifact_generator.animation_spec_llm import (
        generate_animation_spec_with_llm,
        merge_llm_spec_into_content,
    )

    updated = copy.deepcopy(current_content)

    resolved_contract = resolve_animation_contract(
        config=config,
        payload=current_content,
        default_format="html5",
    )
    updated["render_mode"] = resolved_contract.render_mode
    updated["format"] = resolved_contract.animation_format
    updated["animation_format"] = resolved_contract.animation_format
    updated["placement_supported"] = resolved_contract.placement_supported
    updated["runtime_preview_mode"] = "local_preview_only"
    for legacy_key in (
        "cloud_video_provider",
        "cloud_video_model",
        "cloud_video_resolution",
        "cloud_video_watermark",
    ):
        updated.pop(legacy_key, None)

    updated["duration_seconds"] = int(
        config.get("duration_seconds") or current_content.get("duration_seconds") or 6
    )
    updated["rhythm"] = str(
        config.get("rhythm") or current_content.get("rhythm") or "balanced"
    ).strip()

    visual_type = str(
        config.get("visual_type") or current_content.get("visual_type") or ""
    ).strip()
    if visual_type in {"process_flow", "relationship_change", "structure_breakdown"}:
        updated["visual_type"] = visual_type

    style_pack = str(
        config.get("style_pack") or current_content.get("style_pack") or ""
    ).strip()
    if style_pack:
        updated["style_pack"] = style_pack

    new_focus = str(
        config.get("focus") or current_content.get("focus") or message or ""
    ).strip()
    if new_focus:
        updated["focus"] = new_focus

    if message.strip():
        updated["summary"] = message.strip()

    updated["placements"] = list(current_content.get("placements") or [])
    updated["kind"] = "animation_storyboard"

    topic = str(
        config.get("topic")
        or current_content.get("topic")
        or current_content.get("title")
        or message
        or "教学动画 refine"
    )
    should_regen = bool(
        message.strip()
        or config.get("topic")
        or config.get("focus")
        or config.get("visual_type")
    )

    if should_regen:
        rag_snippets = await _load_rag_snippets(
            project_id=project_id,
            query=topic,
            rag_source_ids=rag_source_ids,
        )
        llm_spec = await generate_animation_spec_with_llm(updated, rag_snippets)
        if llm_spec:
            merged = merge_llm_spec_into_content(updated, llm_spec)
            spec = normalize_animation_spec(merged)
            updated["scenes"] = spec["scenes"]
            updated["visual_type"] = spec["visual_type"]
            updated["subject_family"] = spec["subject_family"]
            updated["focus"] = spec["focus"] or updated.get("focus", "")
            updated["objects"] = spec.get("objects", [])
            updated["object_details"] = spec.get("object_details", [])
            updated["title"] = spec.get("title", updated.get("title"))
            updated["summary"] = spec.get("summary", updated.get("summary"))
            updated["animation_family"] = spec.get(
                "animation_family", updated.get("animation_family")
            )

    enriched = await enrich_animation_runtime_snapshot_async(updated)
    _ensure_runtime_snapshot_compiled(enriched)
    enriched["placement_supported"] = resolved_contract.placement_supported
    enriched["runtime_preview_mode"] = "local_preview_only"
    return enriched
