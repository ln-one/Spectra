from __future__ import annotations

from typing import Any


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
    normalized = normalize_animation_spec(merged_animation_payload)
    enriched = await enrich_animation_runtime_snapshot_async(normalized)
    enriched["format"] = "mp4"
    enriched["render_mode"] = "cloud_video_wan"
    enriched["cloud_video_provider"] = "aliyun_wan"
    enriched["cloud_video_model"] = "wan2.7-i2v"
    if config.get("resolution"):
        enriched["cloud_video_resolution"] = str(config["resolution"]).strip()
    if config.get("watermark") is not None:
        enriched["cloud_video_watermark"] = bool(config["watermark"])
    return enriched
