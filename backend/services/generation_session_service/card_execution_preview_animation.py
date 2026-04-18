from __future__ import annotations

from schemas.project_space import ArtifactType
from schemas.studio_cards import (
    ExecutionCarrier,
    RefineMode,
    StudioCardExecutionPreview,
    StudioCardReadiness,
    StudioCardResolvedRequest,
)
from services.artifact_generator.animation_runtime import build_scene_outline, resolve_family_hint
from services.artifact_generator.animation_spec import normalize_animation_spec


def build_animation_execution_preview(
    *,
    card_id: str,
    project_id: str,
    cfg: dict,
    artifact_visibility: str,
    rag_source_ids: list[str] | None,
) -> StudioCardExecutionPreview:
    render_mode = str(cfg.get("render_mode") or "cloud_video_wan").strip().lower()
    animation_format = "mp4" if render_mode == "cloud_video_wan" else str(cfg.get("animation_format", "html5")).lower()
    artifact_type = (
        ArtifactType.GIF.value
        if animation_format == "gif"
        else (ArtifactType.MP4.value if animation_format == "mp4" else ArtifactType.HTML.value)
    )
    preview_spec = normalize_animation_spec(
        {
            "title": cfg.get("topic") or "教学动画",
            "summary": cfg.get("motion_brief") or cfg.get("topic") or "",
            "topic": cfg.get("topic"),
            "focus": cfg.get("motion_brief"),
            "duration_seconds": cfg.get("duration_seconds"),
            "rhythm": cfg.get("rhythm"),
            "style_pack": cfg.get("style_pack"),
            "visual_type": cfg.get("visual_type"),
        }
    )
    return StudioCardExecutionPreview(
        card_id=card_id,
        readiness=StudioCardReadiness.FOUNDATION_READY,
        execution_carrier=ExecutionCarrier.ARTIFACT,
        initial_request=StudioCardResolvedRequest(
            method="POST",
            endpoint=f"/api/v1/projects/{project_id}/artifacts",
            payload={
                "type": artifact_type,
                "visibility": artifact_visibility,
                "rag_source_ids": rag_source_ids or [],
                "content": {
                    "kind": "animation_storyboard",
                    "format": animation_format,
                    "render_mode": render_mode or animation_format,
                    "cloud_video_provider": (
                        "aliyun_wan" if render_mode == "cloud_video_wan" else None
                    ),
                    "topic": cfg.get("topic"),
                    "scene": cfg.get("scene"),
                    "duration_seconds": cfg.get("duration_seconds"),
                    "speed": cfg.get("speed"),
                    "show_trail": cfg.get("show_trail"),
                    "split_view": cfg.get("split_view"),
                    "line_color": cfg.get("line_color"),
                    "summary": cfg.get("motion_brief") or cfg.get("topic"),
                    "cloud_video_model": (
                        "wan2.7-i2v" if render_mode == "cloud_video_wan" else None
                    ),
                    "cloud_video_resolution": (
                        str(cfg.get("resolution") or "720P").strip()
                        if render_mode == "cloud_video_wan"
                        else None
                    ),
                    "cloud_video_watermark": (
                        bool(cfg.get("watermark"))
                        if render_mode == "cloud_video_wan"
                        else None
                    ),
                },
            },
            notes="动画卡片默认走百炼 Wan 图生视频异步任务，正式成果输出 MP4。",
        ),
        refine_request=StudioCardResolvedRequest(
            method="POST",
            endpoint="/api/v1/chat/messages",
            refine_mode=RefineMode.CHAT_REFINE,
            payload={
                "project_id": project_id,
                "message": "",
                "metadata": {
                    "card_id": card_id,
                    "animation_parameters": cfg.get("animation_parameters"),
                },
            },
            notes="参数热更新仍通过 chat 路径承托。",
        ),
        spec_preview={
            "artifact_type": artifact_type,
            "family_hint": resolve_family_hint(preview_spec),
            "scene_outline": build_scene_outline(preview_spec),
            "visual_type": preview_spec.get("visual_type"),
            "summary": preview_spec.get("summary"),
            "title": preview_spec.get("title"),
        },
    )
