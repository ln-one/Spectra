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


def test_interactive_games_preview_marks_legacy_compatibility_as_limited():
    preview = build_studio_card_execution_preview(
        card_id="interactive_games",
        project_id="proj-1",
        config={
            "topic": "电路基础",
            "game_pattern": "term_pairing",
            "creative_brief": "把核心术语和定义配对",
        },
    )

    assert preview is not None
    assert preview.initial_request.payload["type"] == "html"
    assert "legacy compatibility" in (preview.initial_request.notes or "")
    assert (
        preview.refine_request.payload["metadata"]["compatibility_zone"]
        == "interactive_games_legacy_compatibility"
    )


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
