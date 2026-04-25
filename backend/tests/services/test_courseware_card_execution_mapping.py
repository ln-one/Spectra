from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from schemas.studio_cards import (
    StudioCardExecutionPreview,
    StudioCardExecutionPreviewRequest,
    StudioCardReadiness,
    StudioCardResolvedRequest,
)
from services.generation_session_service.card_execution_runtime_sessions import (
    execute_studio_card_session_request,
)
from services.generation_session_service.card_execution_preview import (
    build_studio_card_execution_preview,
)
from services.generation_session_service.diego_runtime_helpers import (
    build_diego_create_payload,
)


class _FakeGenerationSessionModel:
    def __init__(self):
        self.find_first = AsyncMock(
            return_value=SimpleNamespace(id="session-1", projectId="proj-1")
        )
        self.update = AsyncMock()


class _FakeSessionService:
    SCHEMA_VERSION = 1

    def __init__(self):
        self._db = SimpleNamespace(generationsession=_FakeGenerationSessionModel())
        self._append_event = AsyncMock()
        self.create_session = AsyncMock(
            return_value={"session_id": "session-1", "id": "session-1"}
        )


@pytest.mark.anyio
async def test_courseware_session_execute_validates_source_with_current_user():
    session_service = _FakeSessionService()
    body = StudioCardExecutionPreviewRequest(
        project_id="proj-1",
        client_session_id="session-1",
        config={"topic": "牛顿第二定律"},
    )
    request_preview = StudioCardResolvedRequest(
        method="POST",
        endpoint="/api/v1/generate/sessions",
        payload={},
    )
    preview = StudioCardExecutionPreview(
        card_id="courseware_ppt",
        readiness=StudioCardReadiness.FOUNDATION_READY,
        initial_request=request_preview,
    )
    run = SimpleNamespace(
        id="run-1",
        sessionId="session-1",
        projectId="proj-1",
        toolType="studio_card:courseware_ppt",
        runNo=1,
        title=None,
        titleSource=None,
        titleUpdatedAt=None,
        status="pending",
        step="outline",
        artifactId=None,
        createdAt=None,
        updatedAt=None,
    )

    with (
        patch(
            "services.generation_session_service.card_execution_runtime_sessions.get_owned_project",
            AsyncMock(),
        ),
        patch(
            "services.generation_session_service.card_execution_runtime_sessions.validate_source_artifact",
            AsyncMock(),
        ) as validate_source_mock,
        patch(
            "services.generation_session_service.card_execution_runtime_sessions.create_session_run",
            AsyncMock(return_value=run),
        ),
        patch(
            "services.generation_session_service.card_execution_runtime_sessions.persist_session_update_and_events",
            AsyncMock(),
        ),
        patch(
            "services.generation_session_service.card_execution_runtime_sessions.start_diego_outline_workflow",
            AsyncMock(),
        ),
        patch(
            "services.generation_session_service.card_execution_runtime_sessions.request_run_title_generation",
            AsyncMock(),
        ),
    ):
        result = await execute_studio_card_session_request(
            card_id="courseware_ppt",
            body=body,
            user_id="user-1",
            payload={
                "output_type": "ppt",
                "options": {"source_artifact_id": "artifact-1"},
            },
            request_preview=request_preview,
            preview=preview,
            session_service=session_service,
            task_queue_service=None,
        )

    validate_source_mock.assert_awaited_once_with(
        project_id="proj-1",
        card_id="courseware_ppt",
        user_id="user-1",
        source_artifact_id="artifact-1",
    )
    assert result.session["session_id"] == "session-1"
    assert result.run["run_id"] == "run-1"


def test_courseware_preview_maps_config_to_options():
    preview = build_studio_card_execution_preview(
        card_id="courseware_ppt",
        project_id="proj-1",
        config={
            "topic": "牛顿第二定律",
            "pages": 24,
            "generation_mode": "template",
            "template_id": "template-42",
            "style_preset": "morandi",
            "visual_policy": "media_required",
        },
        rag_source_ids=["file-1", "file-2"],
    )

    assert preview is not None
    options = preview.initial_request.payload["options"]
    assert options["topic"] == "牛顿第二定律"
    assert options["pages"] == 24
    assert options["target_slide_count"] == 24
    assert options["generation_mode"] == "template"
    assert options["template_id"] == "template-42"
    assert options["style_preset"] == "morandi"
    assert options["visual_policy"] == "media_required"
    assert options["rag_source_ids"] == ["file-1", "file-2"]


def test_courseware_preview_normalizes_alias_and_topic_fallback():
    preview = build_studio_card_execution_preview(
        card_id="courseware_ppt",
        project_id="proj-1",
        config={
            "topic": "电磁感应",
            "target_slide_count": "18",
            "generation_mode": "classic",
        },
    )

    assert preview is not None
    options = preview.initial_request.payload["options"]
    assert options["topic"] == "电磁感应"
    assert options["pages"] == 18
    assert options["target_slide_count"] == 18
    assert options["generation_mode"] == "template"


def test_courseware_preview_accepts_legacy_prompt_for_topic_compat():
    preview = build_studio_card_execution_preview(
        card_id="courseware_ppt",
        project_id="proj-1",
        config={
            "prompt": "遗留字段主题",
            "pages": 10,
        },
    )

    assert preview is not None
    options = preview.initial_request.payload["options"]
    assert options["topic"] == "遗留字段主题"


def test_interactive_games_preview_uses_interactive_game_v2_contract():
    preview = build_studio_card_execution_preview(
        card_id="interactive_games",
        project_id="proj-1",
        config={
            "topic": "电路基础",
            "teaching_goal": "让学生区分串联和并联的特征",
            "interaction_brief": "更偏向拖拽归类",
        },
    )

    assert preview is not None
    assert preview.initial_request.payload["type"] == "html"
    assert "interactive_game.v2" in (preview.initial_request.notes or "")
    assert (
        preview.initial_request.payload["content"]["schema_id"]
        == "interactive_game.v2"
    )
    assert preview.refine_request.refine_mode.value == "chat_refine"
    assert preview.source_request is not None


def test_diego_create_payload_uses_target_slide_count_and_mode_alias():
    payload = build_diego_create_payload(
        options={
            "topic": "概率统计",
            "target_slide_count": "16",
            "generation_mode": "free",
            "style_preset": "auto",
            "visual_policy": "auto",
        },
        diego_project_id="project-1",
    )

    assert payload["topic"] == "概率统计"
    assert payload["project_id"] == "project-1"
    assert payload["target_slide_count"] == 16
    assert payload["generation_mode"] == "scratch"


def test_diego_create_payload_keeps_template_fields():
    payload = build_diego_create_payload(
        options={
            "topic": "化学平衡",
            "pages": 14,
            "generation_mode": "template",
            "template_id": "template-9",
            "style_preset": "auto",
        },
        diego_project_id="project-2",
    )

    assert payload["project_id"] == "project-2"
    assert payload["target_slide_count"] == 14
    assert payload["generation_mode"] == "template"
    assert payload["template_id"] == "template-9"


def test_diego_create_payload_enriches_topic_with_live_brief_fields():
    payload = build_diego_create_payload(
        options={
            "topic": "围绕牛顿第二定律生成一份高中物理课件",
            "pages": 12,
            "generation_mode": "scratch",
            "teaching_brief": {
                "topic": "牛顿第二定律",
                "audience": "高一学生",
                "lesson_hours": 4,
                "target_pages": 12,
                "teaching_objectives": ["理解F=ma", "能进行受力分析"],
                "knowledge_points": [
                    {"title": "力、质量与加速度关系"},
                    {"title": "受力分析"},
                ],
                "global_emphasis": ["概念建模"],
                "global_difficulties": ["受力分析"],
                "teaching_strategy": "结合生活情境和例题推导",
                "style_profile": {
                    "visual_tone": "academic",
                    "notes": "少用装饰，图示清晰",
                },
            },
        },
        diego_project_id="project-3",
    )

    assert payload["topic"].startswith("围绕牛顿第二定律生成一份高中物理课件")
    assert "面向高一学生" in payload["topic"]
    assert "课时约4课时" in payload["topic"]
    assert "教学目标突出理解F=ma、能进行受力分析" in payload["topic"]
    assert "覆盖知识点：力、质量与加速度关系、受力分析" in payload["topic"]
    assert "教学组织上采用结合生活情境和例题推导" in payload["topic"]
