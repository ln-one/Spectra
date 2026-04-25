from __future__ import annotations

from schemas.studio_cards import (
    ExecutionCarrier,
    RefineMode,
    StudioCardExecutionPreview,
    StudioCardReadiness,
    StudioCardResolvedRequest,
)
from services.artifact_generator.animation_runtime import build_scene_outline, resolve_family_hint
from services.artifact_generator.animation_spec import normalize_animation_spec
from services.generation_session_service.animation_contract import (
    resolve_animation_contract,
)


def build_animation_execution_preview(
    *,
    card_id: str,
    project_id: str,
    cfg: dict,
    artifact_visibility: str,
    rag_source_ids: list[str] | None,
) -> StudioCardExecutionPreview:
    resolved_contract = resolve_animation_contract(config=cfg, default_format="html5")
    render_mode = resolved_contract.render_mode
    animation_format = resolved_contract.animation_format
    placement_supported = resolved_contract.placement_supported
    artifact_type = resolved_contract.artifact_type
    source_artifact_id = str(cfg.get("source_artifact_id") or "").strip()
    placement_prerequisites = [
        "bind_ppt_artifact",
        "placement_ready_artifact",
    ]
    if placement_supported:
        placement_prerequisites.pop()
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
        render_mode=render_mode,
        artifact_type=artifact_type,
        placement_supported=placement_supported,
        runtime_preview_mode="local_preview_only",
        cloud_render_mode="async_media_export",
        cloud_video_status=None,
        protocol_status="ready_to_execute",
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
                    "topic": cfg.get("topic"),
                    "scene": cfg.get("scene"),
                    "duration_seconds": cfg.get("duration_seconds"),
                    "speed": cfg.get("speed"),
                    "show_trail": cfg.get("show_trail"),
                    "split_view": cfg.get("split_view"),
                    "line_color": cfg.get("line_color"),
                    "summary": cfg.get("motion_brief") or cfg.get("topic"),
                },
            },
            notes=(
                "动画卡片第一阶段正式输出仅支持 GIF/HTML5；"
                "runtime preview 仅为辅助层。"
            ),
        ),
        refine_request=StudioCardResolvedRequest(
            method="POST",
            endpoint=f"/api/v1/generate/studio-cards/{card_id}/refine",
            refine_mode=RefineMode.STRUCTURED_REFINE,
            payload={
                "project_id": project_id,
                "artifact_id": cfg.get("artifact_id"),
                "message": "",
                "refine_mode": RefineMode.STRUCTURED_REFINE.value,
                "selection_anchor": cfg.get("selection_anchor"),
                "source_artifact_id": source_artifact_id or None,
                "rag_source_ids": rag_source_ids or [],
                "config": {
                    "duration_seconds": cfg.get("duration_seconds"),
                    "rhythm": cfg.get("rhythm"),
                    "style_pack": cfg.get("style_pack"),
                    "visual_type": cfg.get("visual_type"),
                    "focus": cfg.get("motion_brief"),
                    "animation_format": animation_format,
                    "render_mode": render_mode,
                },
            },
            notes="动画正式更新通过 structured_refine 生成 replacement artifact；chat 只保留为策略控制面。",
        ),
        source_request=StudioCardResolvedRequest(
            method="GET",
            endpoint=f"/api/v1/generate/studio-cards/{card_id}/sources",
            payload={
                "project_id": project_id,
            },
            notes="PPT source-binding 只用于 placement 二阶段，不阻塞动画初始生成。",
        ),
        placement_request=StudioCardResolvedRequest(
            method="POST",
            endpoint=f"/api/v1/generate/studio-cards/{card_id}/confirm-placement",
            payload={
                "project_id": project_id,
                "artifact_id": cfg.get("artifact_id"),
                "ppt_artifact_id": source_artifact_id or None,
                "page_numbers": [],
                "slot": cfg.get("slot") or "bottom-right",
            },
            notes=(
                "placement 会把动画 artifact 与 PPT 页面绑定关系写入 lineage。"
                if placement_supported
                else "当前 render mode 仅支持导出/预览；若要 placement，请先生成 GIF 版动画。"
            ),
        ),
        spec_preview={
            "artifact_type": artifact_type,
            "render_mode": render_mode,
            "placement_supported": placement_supported,
            "placement_prerequisites": placement_prerequisites,
            "source_artifact_required_for_placement": True,
            "family_hint": resolve_family_hint(preview_spec),
            "scene_outline": build_scene_outline(preview_spec),
            "visual_type": preview_spec.get("visual_type"),
            "summary": preview_spec.get("summary"),
            "title": preview_spec.get("title"),
        },
    )
