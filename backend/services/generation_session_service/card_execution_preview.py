from __future__ import annotations

from schemas.project_space import ArtifactType, ArtifactVisibility
from schemas.studio_cards import (
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


def build_studio_card_execution_preview(
    card_id: str,
    project_id: str,
    config: dict | None = None,
    visibility: str | None = None,
    source_artifact_id: str | None = None,
) -> StudioCardExecutionPreview | None:
    cfg = dict(config or {})
    artifact_visibility = _normalize_visibility(visibility)

    if card_id == "word_document":
        return StudioCardExecutionPreview(
            card_id=card_id,
            readiness=StudioCardReadiness.FOUNDATION_READY,
            initial_request=StudioCardResolvedRequest(
                method="POST",
                endpoint="/api/v1/generate/sessions",
                payload={
                    "project_id": project_id,
                    "output_type": SessionOutputType.WORD.value,
                    "options": {
                        "card_id": card_id,
                        "document_variant": cfg.get(
                            "document_variant", "layered_lesson_plan"
                        ),
                        "teaching_model": cfg.get("teaching_model"),
                        "grade_band": cfg.get("grade_band"),
                    },
                },
                notes="当前文档卡片通过 create-session 主路径落地，细分配置写入 options。",
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
        return StudioCardExecutionPreview(
            card_id=card_id,
            readiness=StudioCardReadiness.FOUNDATION_READY,
            initial_request=StudioCardResolvedRequest(
                method="POST",
                endpoint=f"/api/v1/projects/{project_id}/artifacts",
                payload={
                    "type": ArtifactType.EXERCISE.value,
                    "visibility": artifact_visibility,
                    "content": {
                        "kind": "quiz",
                        "question_count": cfg.get("question_count", 5),
                        "difficulty": cfg.get("difficulty", "medium"),
                        "humorous_distractors": cfg.get("humorous_distractors", False),
                    },
                },
                notes="题目卡片通过 exercise artifact 创建承托，卡片配置已映射到 content。",
            ),
            refine_request=StudioCardResolvedRequest(
                method="POST",
                endpoint="/api/v1/chat/messages",
                payload={
                    "project_id": project_id,
                    "message": "",
                    "metadata": {"card_id": card_id},
                },
                notes="局部题目改写仍走 chat，上下文锚点由前端补充。",
            ),
        )

    if card_id == "knowledge_mindmap":
        return StudioCardExecutionPreview(
            card_id=card_id,
            readiness=StudioCardReadiness.FOUNDATION_READY,
            initial_request=StudioCardResolvedRequest(
                method="POST",
                endpoint=f"/api/v1/projects/{project_id}/artifacts",
                payload={
                    "type": ArtifactType.MINDMAP.value,
                    "visibility": artifact_visibility,
                    "content": {
                        "focus_scope": cfg.get("focus_scope", "full_project"),
                    },
                },
                notes="导图卡片通过 mindmap artifact 创建承托，聚焦范围已写入 content。",
            ),
            refine_request=StudioCardResolvedRequest(
                method="POST",
                endpoint="/api/v1/chat/messages",
                payload={
                    "project_id": project_id,
                    "message": "",
                    "metadata": {
                        "card_id": card_id,
                        "selected_node_path": cfg.get("selected_node_path"),
                    },
                },
                notes="节点选中后的扩展仍通过 chat 路径承托。",
            ),
        )

    if card_id == "demonstration_animations":
        animation_format = str(cfg.get("animation_format", "gif")).lower()
        artifact_type = {
            "gif": ArtifactType.GIF.value,
            "mp4": ArtifactType.MP4.value,
            "html5": ArtifactType.HTML.value,
            "html": ArtifactType.HTML.value,
        }.get(animation_format, ArtifactType.GIF.value)
        return StudioCardExecutionPreview(
            card_id=card_id,
            readiness=StudioCardReadiness.FOUNDATION_READY,
            initial_request=StudioCardResolvedRequest(
                method="POST",
                endpoint=f"/api/v1/projects/{project_id}/artifacts",
                payload={
                    "type": artifact_type,
                    "visibility": artifact_visibility,
                    "content": {
                        "kind": "animation_storyboard",
                        "format": animation_format,
                        "summary": cfg.get("motion_brief"),
                    },
                },
                notes="动画卡片通过 gif/mp4/html artifact 承托，描述已映射到 content。",
            ),
            refine_request=StudioCardResolvedRequest(
                method="POST",
                endpoint="/api/v1/chat/messages",
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
        )

    if card_id == "speaker_notes":
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
                        "source_artifact_id": source_artifact_id
                        or cfg.get("source_artifact_id"),
                    },
                },
                notes="说课助手当前通过 source-artifact + create-session 组合语义落地。",
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
                    "content": {
                        "kind": "interactive_game",
                        "game_pattern": cfg.get("game_pattern", "freeform"),
                        "creative_brief": cfg.get("creative_brief"),
                    },
                },
                notes="互动游戏当前通过 HTML artifact 原型承托，配置已正式映射到 content。",
            ),
        )

    if card_id == "classroom_qa_simulator":
        return StudioCardExecutionPreview(
            card_id=card_id,
            readiness=StudioCardReadiness.PROTOCOL_PENDING,
            initial_request=StudioCardResolvedRequest(
                method="POST",
                endpoint="/api/v1/chat/messages",
                payload={
                    "project_id": project_id,
                    "message": "",
                    "metadata": {
                        "card_id": card_id,
                        "student_profiles": cfg.get("student_profiles", []),
                        "question_focus": cfg.get("question_focus"),
                    },
                },
                notes="学情预演当前仍主要依赖 chat/session/rag 组合语义。",
            ),
        )

    return None
