from __future__ import annotations

from schemas.project_space import ArtifactType, ArtifactVisibility
from schemas.studio_cards import (
    ExecutionCarrier,
    RefineMode,
    StudioCardExecutionPreview,
    StudioCardReadiness,
    StudioCardResolvedRequest,
)
from services.generation_session_service.constants import SessionOutputType


def _normalize_visibility(value: str | None) -> str:
    if not value:
        return ArtifactVisibility.PRIVATE.value
    try:
        return ArtifactVisibility(value).value
    except ValueError:
        return ArtifactVisibility.PRIVATE.value


def _resolve_topic(config: dict) -> str | None:
    topic = str(config.get("topic") or "").strip()
    if topic:
        return topic
    # Backward compatibility for older callers still sending `prompt`.
    prompt = str(config.get("prompt") or "").strip()
    return prompt or None


def _normalize_pages(value: object, *, default: int = 12) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(1, min(parsed, 50))


def _normalize_generation_mode(value: object) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"template", "classic"}:
        return "template"
    return "scratch"


def build_studio_card_execution_preview(
    card_id: str,
    project_id: str,
    config: dict | None = None,
    template_config: dict | None = None,
    visibility: str | None = None,
    source_artifact_id: str | None = None,
    rag_source_ids: list[str] | None = None,
) -> StudioCardExecutionPreview | None:
    cfg = dict(config or {})
    artifact_visibility = _normalize_visibility(visibility)

    if card_id == "courseware_ppt":
        normalized_pages = _normalize_pages(
            cfg.get("pages", cfg.get("target_slide_count", cfg.get("page_count", 12)))
        )
        generation_mode = _normalize_generation_mode(cfg.get("generation_mode"))
        topic = _resolve_topic(cfg)
        return StudioCardExecutionPreview(
            card_id=card_id,
            readiness=StudioCardReadiness.FOUNDATION_READY,
            execution_carrier=ExecutionCarrier.HYBRID,
            initial_request=StudioCardResolvedRequest(
                method="POST",
                endpoint="/api/v1/generate/sessions",
                payload={
                    "project_id": project_id,
                    "output_type": SessionOutputType.PPT.value,
                    "bootstrap_only": True,
                    "options": {
                        "card_id": card_id,
                        "pages": normalized_pages,
                        "target_slide_count": normalized_pages,
                        "topic": topic,
                        "generation_mode": generation_mode,
                        "template_id": cfg.get("template_id"),
                        "style_preset": cfg.get("style_preset", "auto"),
                        "visual_policy": cfg.get("visual_policy", "auto"),
                        "source_artifact_id": source_artifact_id
                        or cfg.get("source_artifact_id"),
                        "rag_source_ids": rag_source_ids or [],
                    },
                },
                notes=(
                    "课件卡片通过 create-session bootstrap 路径绑定会话，"
                    "卡片配置写入 options，正式执行由 Diego runtime 承担。"
                ),
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
                        "template": cfg.get("template", "default"),
                        "pages": normalized_pages,
                    },
                },
                notes="课件上下文微调通过 chat 路径承托，message 由前端填充。",
            ),
        )

    if card_id == "word_document":
        return StudioCardExecutionPreview(
            card_id=card_id,
            readiness=StudioCardReadiness.FOUNDATION_READY,
            execution_carrier=ExecutionCarrier.HYBRID,
            initial_request=StudioCardResolvedRequest(
                method="POST",
                endpoint=f"/api/v1/projects/{project_id}/artifacts",
                payload={
                    "type": ArtifactType.DOCX.value,
                    "visibility": artifact_visibility,
                    "rag_source_ids": rag_source_ids or [],
                    "content": {
                        "card_id": card_id,
                        "document_variant": cfg.get(
                            "document_variant", "layered_lesson_plan"
                        ),
                        "teaching_model": cfg.get("teaching_model"),
                        "grade_band": cfg.get("grade_band"),
                        "topic": cfg.get("topic"),
                        "learning_goal": cfg.get("learning_goal"),
                        "difficulty_layer": cfg.get("difficulty_layer"),
                        "source_artifact_id": (
                            source_artifact_id or cfg.get("source_artifact_id")
                        ),
                    },
                },
                notes="文档卡片通过 artifact create 路径落地，配置写入 content。",
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
                        "document_variant": cfg.get(
                            "document_variant", "layered_lesson_plan"
                        ),
                    },
                },
                notes="局部改写通过 chat 路径承托，message 由前端在上下文中填充。",
            ),
        )

    if card_id == "interactive_quick_quiz":
        current_question_id = cfg.get("question_id") or cfg.get("current_question_id")
        return StudioCardExecutionPreview(
            card_id=card_id,
            readiness=StudioCardReadiness.FOUNDATION_READY,
            execution_carrier=ExecutionCarrier.ARTIFACT,
            initial_request=StudioCardResolvedRequest(
                method="POST",
                endpoint=f"/api/v1/projects/{project_id}/artifacts",
                payload={
                    "type": ArtifactType.EXERCISE.value,
                    "visibility": artifact_visibility,
                    "rag_source_ids": rag_source_ids or [],
                    "content": {
                        "kind": "quiz",
                        "scope": cfg.get("scope"),
                        "question_count": cfg.get(
                            "count", cfg.get("question_count", 5)
                        ),
                        "difficulty": cfg.get("difficulty", "medium"),
                        "question_type": cfg.get("question_type", "single"),
                        "style_tags": cfg.get("style_tags", []),
                        "humorous_distractors": cfg.get(
                            "humorous_distractors",
                            "加入幽默干扰项" in (cfg.get("style_tags") or []),
                        ),
                    },
                },
                notes="题目卡片通过 exercise artifact 创建承托，卡片配置已映射到 content。",
            ),
            refine_request=StudioCardResolvedRequest(
                method="POST",
                endpoint="/api/v1/generate/studio-cards/interactive_quick_quiz/refine",
                refine_mode=RefineMode.STRUCTURED_REFINE,
                payload={
                    "project_id": project_id,
                    "message": "",
                    "artifact_id": cfg.get("artifact_id"),
                    "rag_source_ids": rag_source_ids or [],
                    "config": {"current_question_id": current_question_id},
                    "metadata": {
                        "card_id": card_id,
                        "current_question_id": current_question_id,
                    },
                },
                notes=(
                    "单题重写通过 refine 触发 replacement artifact，"
                    "current_question_id 用作正式锚点。"
                ),
            ),
        )

    if card_id == "knowledge_mindmap":
        selected_node_path = cfg.get("selected_node_path") or cfg.get("selected_id")
        return StudioCardExecutionPreview(
            card_id=card_id,
            readiness=StudioCardReadiness.FOUNDATION_READY,
            execution_carrier=ExecutionCarrier.ARTIFACT,
            initial_request=StudioCardResolvedRequest(
                method="POST",
                endpoint=f"/api/v1/projects/{project_id}/artifacts",
                payload={
                    "type": ArtifactType.MINDMAP.value,
                    "visibility": artifact_visibility,
                    "rag_source_ids": rag_source_ids or [],
                    "content": {
                        "topic": cfg.get("topic"),
                        "depth": cfg.get("depth", 3),
                        "focus": cfg.get(
                            "focus", cfg.get("focus_scope", "full_project")
                        ),
                        "target_audience": cfg.get("target_audience"),
                        "focus_scope": cfg.get("focus_scope", "full_project"),
                    },
                },
                notes=(
                    "导图卡片通过 mindmap artifact 创建承托，"
                    "聚焦范围已写入 content。"
                ),
            ),
            refine_request=StudioCardResolvedRequest(
                method="POST",
                endpoint="/api/v1/generate/studio-cards/knowledge_mindmap/refine",
                refine_mode=RefineMode.STRUCTURED_REFINE,
                payload={
                    "project_id": project_id,
                    "message": "",
                    "artifact_id": cfg.get("artifact_id"),
                    "rag_source_ids": rag_source_ids or [],
                    "config": {"selected_node_path": selected_node_path},
                    "metadata": {
                        "card_id": card_id,
                        "selected_node_path": selected_node_path,
                    },
                },
                notes=(
                    "节点扩展通过 refine 触发 replacement artifact，"
                    "selected_node_path 用作正式锚点。"
                ),
            ),
        )

    if card_id == "demonstration_animations":
        render_mode = str(cfg.get("render_mode") or "").strip().lower()
        animation_format = str(cfg.get("animation_format", "html5")).lower()
        if render_mode == "cloud_video_wan":
            animation_format = "mp4"
        artifact_type = (
            ArtifactType.GIF.value
            if animation_format == "gif"
            else (
                ArtifactType.MP4.value
                if animation_format == "mp4"
                else ArtifactType.HTML.value
            )
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
                    },
                },
                notes="动画卡片统一先生成 storyboard，再按 format 输出 HTML5/GIF/MP4 成果。",
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
            spec_preview={"artifact_type": artifact_type},
        )

    if card_id == "speaker_notes":
        return StudioCardExecutionPreview(
            card_id=card_id,
            readiness=StudioCardReadiness.FOUNDATION_READY,
            execution_carrier=ExecutionCarrier.HYBRID,
            initial_request=StudioCardResolvedRequest(
                method="POST",
                endpoint=f"/api/v1/projects/{project_id}/artifacts",
                payload={
                    "type": ArtifactType.SUMMARY.value,
                    "visibility": artifact_visibility,
                    "rag_source_ids": rag_source_ids or [],
                    "content": {
                        "kind": "speaker_notes",
                        "schema_version": "speaker_notes.v2",
                        "source_artifact_id": (
                            source_artifact_id or cfg.get("source_artifact_id")
                        ),
                        "topic": cfg.get("topic"),
                        "tone": cfg.get("tone"),
                        "emphasize_interaction": cfg.get("emphasize_interaction"),
                        "active_page": cfg.get("active_page"),
                        "highlight_transition": cfg.get("highlight_transition"),
                    },
                },
                notes="说课助手当前通过结构化 summary artifact 直接承载逐页讲稿。",
            ),
            refine_request=StudioCardResolvedRequest(
                method="POST",
                endpoint="/api/v1/generate/studio-cards/speaker_notes/refine",
                refine_mode=RefineMode.STRUCTURED_REFINE,
                payload={
                    "project_id": project_id,
                    "message": "",
                    "artifact_id": cfg.get("artifact_id"),
                    "refine_mode": RefineMode.STRUCTURED_REFINE.value,
                    "selection_anchor": cfg.get("selection_anchor"),
                    "source_artifact_id": source_artifact_id
                    or cfg.get("source_artifact_id"),
                    "rag_source_ids": rag_source_ids or [],
                    "config": {
                        "active_page": cfg.get("active_page"),
                        "highlight_transition": cfg.get("highlight_transition"),
                    },
                    "metadata": {
                        "card_id": card_id,
                        "source_artifact_id": source_artifact_id
                        or cfg.get("source_artifact_id"),
                        "selection_anchor": cfg.get("selection_anchor"),
                        "active_page": cfg.get("active_page"),
                        "highlight_transition": cfg.get("highlight_transition"),
                    },
                },
                notes="提词器段落级改写通过结构化 refine 触发 replacement artifact，并显式绑定段落锚点。",
            ),
        )

    if card_id == "interactive_games":
        return StudioCardExecutionPreview(
            card_id=card_id,
            readiness=StudioCardReadiness.FOUNDATION_READY,
            execution_carrier=ExecutionCarrier.ARTIFACT,
            initial_request=StudioCardResolvedRequest(
                method="POST",
                endpoint=f"/api/v1/projects/{project_id}/artifacts",
                payload={
                    "type": ArtifactType.HTML.value,
                    "visibility": artifact_visibility,
                    "rag_source_ids": rag_source_ids or [],
                    "content": {
                        "kind": "interactive_game",
                        "topic": cfg.get("topic"),
                        "game_pattern": cfg.get(
                            "mode", cfg.get("game_pattern", "freeform")
                        ),
                        "creative_brief": (
                            cfg.get("creative_brief") or cfg.get("topic")
                        ),
                        "countdown": cfg.get("countdown"),
                        "life": cfg.get("life"),
                        "idea_tags": cfg.get("idea_tags", []),
                    },
                },
                notes=(
                    "互动游戏当前通过 HTML artifact 原型承托，"
                    "配置已正式映射到 content。"
                ),
            ),
            refine_request=StudioCardResolvedRequest(
                method="POST",
                endpoint="/api/v1/generate/studio-cards/interactive_games/refine",
                refine_mode=RefineMode.STRUCTURED_REFINE,
                payload={
                    "project_id": project_id,
                    "message": "",
                    "artifact_id": cfg.get("artifact_id"),
                    "rag_source_ids": rag_source_ids or [],
                    "config": {
                        "game_pattern": cfg.get(
                            "mode", cfg.get("game_pattern", "freeform")
                        ),
                        "sandbox_patch": cfg.get("sandbox_patch"),
                    },
                    "metadata": {
                        "card_id": card_id,
                        "game_pattern": cfg.get(
                            "mode", cfg.get("game_pattern", "freeform")
                        ),
                        "sandbox_patch": cfg.get("sandbox_patch"),
                    },
                },
                notes="游戏热更新通过 refine 触发 replacement artifact，sandbox_patch 为正式更新输入。",
            ),
        )

    if card_id == "classroom_qa_simulator":
        return StudioCardExecutionPreview(
            card_id=card_id,
            readiness=StudioCardReadiness.FOUNDATION_READY,
            execution_carrier=ExecutionCarrier.HYBRID,
            initial_request=StudioCardResolvedRequest(
                method="POST",
                endpoint=f"/api/v1/projects/{project_id}/artifacts",
                payload={
                    "type": ArtifactType.SUMMARY.value,
                    "visibility": artifact_visibility,
                    "rag_source_ids": rag_source_ids or [],
                    "content": {
                        "kind": "classroom_qa_simulator",
                        "student_profiles": cfg.get(
                            "student_profiles",
                            [cfg.get("profile")] if cfg.get("profile") else [],
                        ),
                        "question_focus": (
                            cfg.get("question_focus") or cfg.get("topic")
                        ),
                        "turns": cfg.get("turns", 3),
                        "topic": cfg.get("topic"),
                        "intensity": cfg.get("intensity"),
                        "include_strategy_panel": cfg.get("include_strategy_panel"),
                    },
                },
                notes="学情预演当前先落成 summary artifact 预演脚本，作为后续虚拟问答回路的稳定输入。",
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
                        "active_student_profile": cfg.get("active_student_profile")
                        or cfg.get("profile"),
                        "question_focus": cfg.get("question_focus") or cfg.get("topic"),
                        "turn_anchor": cfg.get("question_id"),
                    },
                },
                notes="多轮虚拟学生追问仍先复用 chat 路径承托。",
            ),
        )

    return None
