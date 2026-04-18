"""Animation storyboard structured refine."""

from __future__ import annotations

import copy
from typing import Any

from .common import _load_rag_snippets


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

    render_mode = str(
        config.get("render_mode") or current_content.get("render_mode") or "gif"
    ).strip()
    updated["render_mode"] = render_mode
    updated["format"] = "mp4" if render_mode == "cloud_video_wan" else "gif"
    if render_mode == "cloud_video_wan":
        updated["cloud_video_provider"] = "aliyun_wan"
    else:
        updated.pop("cloud_video_provider", None)

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

    return await enrich_animation_runtime_snapshot_async(updated)
