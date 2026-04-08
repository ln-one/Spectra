from __future__ import annotations

from schemas.project_space import ArtifactType, ArtifactVisibility
from schemas.studio_cards import (
    StudioCardExecutionPreview,
    StudioCardReadiness,
    StudioCardResolvedRequest,
)
from services.artifact_generator.animation_spec import normalize_animation_spec
from services.generation_session_service.constants import SessionOutputType


def _normalize_visibility(value: str | None) -> str:
    if not value:
        return ArtifactVisibility.PRIVATE.value
    try:
        return ArtifactVisibility(value).value
    except ValueError:
        return ArtifactVisibility.PRIVATE.value


def _animation_visual_label(visual_type: str) -> str:
    mapping = {
        "process_flow": "过程演示",
        "relationship_change": "关系变化",
        "structure_breakdown": "结构拆解",
    }
    return mapping.get(visual_type, "过程演示")


def _build_animation_base_content(cfg: dict) -> dict:
    return {
        "kind": "animation_storyboard",
        "format": "gif",
        "topic": cfg.get("topic"),
        "style_pack": cfg.get("style_pack") or "teaching_ppt_cartoon",
        "visual_type": cfg.get("visual_type"),
        "scene": cfg.get("scene"),
        "speed": cfg.get("speed"),
        "duration_seconds": cfg.get("duration_seconds", 6),
        "rhythm": cfg.get("rhythm", "balanced"),
        "focus": cfg.get("focus") or cfg.get("topic"),
        "summary": cfg.get("motion_brief") or cfg.get("topic"),
        "placements": [],
    }


def _build_animation_spec_preview(cfg: dict) -> tuple[dict, list[dict], float, bool]:
    base_content = _build_animation_base_content(cfg)
    topic = str(base_content.get("topic") or "").strip()
    focus = str(base_content.get("focus") or "").strip()
    summary = str(base_content.get("summary") or "").strip()
    raw_text = " ".join([topic, focus, summary]).strip()
    confidence = 0.86
    reasons: list[str] = []
    if len(topic) < 4:
        confidence -= 0.2
        reasons.append("主题描述偏短，语义锚点不足")
    if len(raw_text) < 12:
        confidence -= 0.2
        reasons.append("输入信息量较少")
    if not focus:
        confidence -= 0.08
        reasons.append("未明确表现重点")
    confidence = max(0.25, min(confidence, 0.97))
    spec = normalize_animation_spec(base_content)
    preview = {
        "style_pack": spec.get("style_pack"),
        "visual_type": spec.get("visual_type"),
        "visual_label": _animation_visual_label(str(spec.get("visual_type") or "")),
        "teaching_goal": spec.get("teaching_goal"),
        "objects": spec.get("objects") or [],
        "object_details": spec.get("object_details") or [],
        "scenes": [
            {
                "title": scene.get("title"),
                "description": scene.get("description"),
                "emphasis": scene.get("emphasis"),
                "transition": scene.get("transition"),
            }
            for scene in (spec.get("scenes") or [])
            if isinstance(scene, dict)
        ],
        "screen_text": {
            "标题": spec.get("title"),
            "副标题": spec.get("teaching_goal"),
        },
        "confidence_reasons": reasons,
    }

    needs_choice = confidence < 0.62
    candidates: list[dict] = []
    if needs_choice:
        for visual_type in (
            "structure_breakdown",
            "process_flow",
            "relationship_change",
        ):
            candidate_spec = normalize_animation_spec(
                {**base_content, "visual_type": visual_type}
            )
            candidates.append(
                {
                    "style_pack": candidate_spec.get("style_pack"),
                    "visual_type": candidate_spec.get("visual_type"),
                    "visual_label": _animation_visual_label(
                        str(candidate_spec.get("visual_type") or "")
                    ),
                    "teaching_goal": candidate_spec.get("teaching_goal"),
                    "scene_titles": [
                        scene.get("title")
                        for scene in (candidate_spec.get("scenes") or [])
                        if isinstance(scene, dict)
                    ],
                }
            )
    return preview, candidates, round(confidence, 3), needs_choice


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
    template_cfg = dict(template_config) if isinstance(template_config, dict) else {}
    artifact_visibility = _normalize_visibility(visibility)

    if card_id == "courseware_ppt":
        return StudioCardExecutionPreview(
            card_id=card_id,
            readiness=StudioCardReadiness.FOUNDATION_READY,
            initial_request=StudioCardResolvedRequest(
                method="POST",
                endpoint="/api/v1/generate/sessions",
                payload={
                    "project_id": project_id,
                    "output_type": SessionOutputType.PPT.value,
                    "options": {
                        "card_id": card_id,
                        "template": cfg.get("template", "default"),
                        "pages": cfg.get("pages", 12),
                        "audience": cfg.get("audience", "intermediate"),
                        "system_prompt_tone": cfg.get("system_prompt_tone"),
                        "include_animations": bool(
                            cfg.get("include_animations", False)
                        ),
                        "include_games": bool(cfg.get("include_games", False)),
                        "template_config": template_cfg or None,
                        "source_artifact_id": source_artifact_id
                        or cfg.get("source_artifact_id"),
                        "rag_source_ids": rag_source_ids or [],
                    },
                },
                notes="课件卡片通过 create-session 主路径落地，卡片配置写入 options。",
            ),
            refine_request=StudioCardResolvedRequest(
                method="POST",
                endpoint="/api/v1/chat/messages",
                payload={
                    "project_id": project_id,
                    "message": "",
                    "metadata": {
                        "card_id": card_id,
                        "template": cfg.get("template", "default"),
                        "pages": cfg.get("pages", 12),
                    },
                },
                notes="课件上下文微调通过 chat 路径承托，message 由前端填充。",
            ),
        )

    if card_id == "word_document":
        return StudioCardExecutionPreview(
            card_id=card_id,
            readiness=StudioCardReadiness.FOUNDATION_READY,
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
        spec_preview, spec_candidates, spec_confidence, needs_user_choice = (
            _build_animation_spec_preview(cfg)
        )
        return StudioCardExecutionPreview(
            card_id=card_id,
            readiness=StudioCardReadiness.FOUNDATION_READY,
            initial_request=StudioCardResolvedRequest(
                method="POST",
                endpoint=f"/api/v1/projects/{project_id}/artifacts",
                payload={
                    "type": ArtifactType.GIF.value,
                    "visibility": artifact_visibility,
                    "rag_source_ids": rag_source_ids or [],
                    "content": {
                        "kind": "animation_storyboard",
                        "format": "gif",
                        "topic": cfg.get("topic"),
                        "style_pack": cfg.get("style_pack") or "teaching_ppt_cartoon",
                        "visual_type": cfg.get("visual_type"),
                        "scene": cfg.get("scene"),
                        "speed": cfg.get("speed"),
                        "duration_seconds": cfg.get("duration_seconds", 6),
                        "rhythm": cfg.get("rhythm", "balanced"),
                        "focus": cfg.get("focus") or cfg.get("topic"),
                        "summary": cfg.get("motion_brief") or cfg.get("topic"),
                        "placements": [],
                    },
                },
                notes="动画卡片第一阶段固定输出 GIF，并作为独立 artifact 入库。",
            ),
            refine_request=StudioCardResolvedRequest(
                method="POST",
                endpoint="/api/v1/generate/studio-cards/demonstration_animations/refine",  # noqa: E501
                payload={
                    "project_id": project_id,
                    "message": "",
                    "artifact_id": cfg.get("artifact_id"),
                    "rag_source_ids": rag_source_ids or [],
                    "config": {
                        "duration_seconds": cfg.get("duration_seconds", 6),
                        "rhythm": cfg.get("rhythm", "balanced"),
                        "focus": cfg.get("focus") or cfg.get("topic"),
                        "visual_type": cfg.get("visual_type"),
                        "style_pack": cfg.get("style_pack") or "teaching_ppt_cartoon",
                    },
                    "metadata": {"card_id": card_id},
                },
                notes="动画 refine 通过 replacement GIF artifact 收口，不反向覆盖已插入的 PPT。",
            ),
            spec_preview=spec_preview,
            spec_candidates=spec_candidates,
            spec_confidence=spec_confidence,
            needs_user_choice=needs_user_choice,
        )

    if card_id == "speaker_notes":
        return StudioCardExecutionPreview(
            card_id=card_id,
            readiness=StudioCardReadiness.FOUNDATION_READY,
            initial_request=StudioCardResolvedRequest(
                method="POST",
                endpoint=f"/api/v1/projects/{project_id}/artifacts",
                payload={
                    "type": ArtifactType.SUMMARY.value,
                    "visibility": artifact_visibility,
                    "rag_source_ids": rag_source_ids or [],
                    "content": {
                        "kind": "speaker_notes",
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
                notes="说课助手当前通过 summary artifact 直接承载逐页讲稿。",
            ),
            refine_request=StudioCardResolvedRequest(
                method="POST",
                endpoint="/api/v1/generate/studio-cards/speaker_notes/refine",
                payload={
                    "project_id": project_id,
                    "message": "",
                    "artifact_id": cfg.get("artifact_id"),
                    "source_artifact_id": source_artifact_id
                    or cfg.get("source_artifact_id"),
                    "rag_source_ids": rag_source_ids or [],
                    "config": {
                        "selected_script_segment": cfg.get("selected_script_segment"),
                        "active_page": cfg.get("active_page"),
                        "highlight_transition": cfg.get("highlight_transition"),
                    },
                    "metadata": {
                        "card_id": card_id,
                        "source_artifact_id": source_artifact_id
                        or cfg.get("source_artifact_id"),
                        "selected_script_segment": cfg.get("selected_script_segment"),
                        "active_page": cfg.get("active_page"),
                        "highlight_transition": cfg.get("highlight_transition"),
                    },
                },
                notes="提词器段落级改写通过 refine 触发 replacement artifact，并显式绑定段落锚点。",
            ),
        )

    if card_id == "interactive_games":
        return StudioCardExecutionPreview(
            card_id=card_id,
            readiness=StudioCardReadiness.FOUNDATION_READY,
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
