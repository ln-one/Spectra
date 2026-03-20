"""API acceptance tests for async outline drafting."""

import json
import time
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers.generate_sessions import router as generate_sessions_router
from services.database import db_service
from services.generation_session_service.constants import (
    OutlineGenerationErrorCode,
    OutlineGenerationStateReason,
    SessionLifecycleReason,
    SessionOutputType,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState
from utils.dependencies import get_current_user


def _build_test_app() -> FastAPI:
    app = FastAPI()
    app.state.task_queue_service = None
    app.include_router(generate_sessions_router, prefix="/api/v1")
    return app


@pytest.fixture
def app():
    return _build_test_app()


@pytest.fixture
def mock_db_service():
    mock_project = SimpleNamespace(
        id="p-001",
        userId="u-001",
        name="test-project",
        description="test-description",
    )
    mock_session = SimpleNamespace(
        id="s-001",
        projectId="p-001",
        userId="u-001",
        state=GenerationState.DRAFTING_OUTLINE.value,
        outputType="ppt",
        options=None,
        clientSessionId=None,
        renderVersion=0,
        currentOutlineVersion=0,
        resumable=True,
        updatedAt=datetime.now(timezone.utc),
        progress=0,
        stateReason=None,
    )
    return SimpleNamespace(
        get_project=AsyncMock(return_value=mock_project),
        project=SimpleNamespace(find_unique=AsyncMock(return_value=mock_project)),
        generationsession=SimpleNamespace(
            create=AsyncMock(return_value=mock_session),
            find_first=AsyncMock(return_value=None),
            find_unique=AsyncMock(return_value=mock_session),
            update=AsyncMock(),
        ),
        sessionevent=SimpleNamespace(
            create=AsyncMock(),
            find_many=AsyncMock(return_value=[]),
        ),
    )


@pytest.fixture()
def _as_user(app):
    app.dependency_overrides[get_current_user] = lambda: "u-001"
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.anyio
async def test_create_session_returns_quickly_and_schedules_outline(
    app, mock_db_service, _as_user
):
    schedule_mock = AsyncMock()
    with patch.object(db_service, "get_project", mock_db_service.get_project):
        with patch.object(db_service, "db", mock_db_service):
            with patch(
                "services.generation_session_service.GenerationSessionService._schedule_outline_draft_task",
                schedule_mock,
            ):
                client = TestClient(app)
                start_time = time.monotonic()
                response = client.post(
                    "/api/v1/generate/sessions",
                    json={
                        "project_id": "p-001",
                        "output_type": SessionOutputType.PPT.value,
                        "options": {"pages": 10},
                    },
                )
                elapsed_ms = (time.monotonic() - start_time) * 1000

    schedule_mock.assert_awaited_once()
    assert elapsed_ms < 2000
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["session"]["state"] == GenerationState.DRAFTING_OUTLINE.value
    assert data["data"]["session"]["session_id"] == "s-001"


@pytest.mark.anyio
async def test_create_session_bootstrap_only_does_not_schedule_outline(
    app, mock_db_service, _as_user
):
    idle_session = SimpleNamespace(
        id="s-bootstrap-001",
        projectId="p-001",
        userId="u-001",
        state=GenerationState.IDLE.value,
        outputType="both",
        options=None,
        clientSessionId=None,
        renderVersion=0,
        currentOutlineVersion=0,
        resumable=True,
        updatedAt=datetime.now(timezone.utc),
        progress=0,
        stateReason=None,
    )
    mock_db_service.generationsession.find_first = AsyncMock(return_value=None)
    mock_db_service.generationsession.create = AsyncMock(return_value=idle_session)

    schedule_mock = AsyncMock()
    with patch.object(db_service, "get_project", mock_db_service.get_project):
        with patch.object(db_service, "db", mock_db_service):
            with patch(
                "services.generation_session_service.GenerationSessionService._schedule_outline_draft_task",
                schedule_mock,
            ):
                client = TestClient(app)
                response = client.post(
                    "/api/v1/generate/sessions",
                    json={
                        "project_id": "p-001",
                        "output_type": SessionOutputType.BOTH.value,
                        "bootstrap_only": True,
                    },
                )

    schedule_mock.assert_not_awaited()
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["session"]["state"] == GenerationState.IDLE.value
    assert data["data"]["session"]["session_id"] == "s-bootstrap-001"


@pytest.mark.anyio
async def test_create_session_reuses_current_session_when_client_session_id_matches(
    app, mock_db_service, _as_user
):
    existing_session = SimpleNamespace(
        id="s-existing-001",
        projectId="p-001",
        userId="u-001",
        state=GenerationState.IDLE.value,
        outputType="both",
        options=None,
        clientSessionId="s-existing-001",
        renderVersion=0,
        currentOutlineVersion=0,
        resumable=True,
        updatedAt=datetime.now(timezone.utc),
        progress=0,
        stateReason=None,
    )
    started_session = SimpleNamespace(
        id="s-existing-001",
        projectId="p-001",
        userId="u-001",
        state=GenerationState.DRAFTING_OUTLINE.value,
        outputType="ppt",
        options=json.dumps({"pages": 12}),
        clientSessionId="s-existing-001",
        renderVersion=0,
        currentOutlineVersion=0,
        resumable=True,
        updatedAt=datetime.now(timezone.utc),
        progress=0,
        stateReason=None,
    )
    mock_db_service.generationsession.find_first = AsyncMock(
        return_value=existing_session
    )
    mock_db_service.generationsession.update = AsyncMock(return_value=started_session)

    schedule_mock = AsyncMock()
    with patch.object(db_service, "get_project", mock_db_service.get_project):
        with patch.object(db_service, "db", mock_db_service):
            with patch(
                "services.generation_session_service.GenerationSessionService._schedule_outline_draft_task",
                schedule_mock,
            ):
                client = TestClient(app)
                response = client.post(
                    "/api/v1/generate/sessions",
                    json={
                        "project_id": "p-001",
                        "output_type": SessionOutputType.PPT.value,
                        "client_session_id": "s-existing-001",
                        "options": {"pages": 12},
                    },
                )

    schedule_mock.assert_awaited_once()
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["session"]["session_id"] == "s-existing-001"
    assert data["data"]["session"]["state"] == GenerationState.DRAFTING_OUTLINE.value
    update_calls = [
        call.kwargs for call in mock_db_service.generationsession.update.await_args_list
    ]
    assert any(call["where"] == {"id": "s-existing-001"} for call in update_calls)
    assert any(
        call["data"].get("state") == GenerationState.DRAFTING_OUTLINE.value
        for call in update_calls
    )
    event_calls = [
        call.kwargs["data"]
        for call in mock_db_service.sessionevent.create.await_args_list
    ]
    state_change_events = [
        event
        for event in event_calls
        if event["eventType"] == GenerationEventType.STATE_CHANGED.value
    ]
    assert any(
        json.loads(event["payload"]).get("reason")
        == SessionLifecycleReason.SESSION_REUSED.value
        for event in state_change_events
    )


@pytest.mark.anyio
async def test_sse_events_sequence_success_path():
    from services.generation_session_service import GenerationSessionService

    mock_db = SimpleNamespace(
        project=SimpleNamespace(
            find_unique=AsyncMock(
                return_value=SimpleNamespace(
                    id="p-001",
                    name="test-project",
                    description="test-description",
                )
            )
        ),
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(
                return_value={
                    "state": GenerationState.DRAFTING_OUTLINE.value,
                    "currentOutlineVersion": 0,
                }
            ),
            update=AsyncMock(),
        ),
        outlineversion=SimpleNamespace(create=AsyncMock()),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )
    service = GenerationSessionService(db=mock_db)
    mock_outline = SimpleNamespace(
        sections=[
            SimpleNamespace(
                title="Section 1", key_points=["Point 1", "Point 2"], slide_count=2
            )
        ]
    )

    with patch("services.generation_session_service.ai_service") as mock_ai:
        mock_ai.generate_outline = AsyncMock(return_value=mock_outline)
        await service._execute_outline_draft_local(
            session_id="s-001",
            project_id="p-001",
            options={"pages": 10},
        )

    event_calls = [
        call.kwargs["data"] for call in mock_db.sessionevent.create.await_args_list
    ]
    progress_events = [
        e
        for e in event_calls
        if e["eventType"] == GenerationEventType.PROGRESS_UPDATED.value
    ]
    outline_events = [
        e
        for e in event_calls
        if e["eventType"] == GenerationEventType.OUTLINE_UPDATED.value
    ]
    state_events = [
        e
        for e in event_calls
        if e["eventType"] == GenerationEventType.STATE_CHANGED.value
    ]

    assert progress_events
    assert outline_events
    assert any(
        e["state"] == GenerationState.AWAITING_OUTLINE_CONFIRM.value
        for e in state_events
    )
    payload = json.loads(outline_events[0]["payload"])
    assert payload["version"] == 1
    assert payload["change_reason"] == "drafted_async"
    assert "trace_id" in payload


@pytest.mark.anyio
async def test_sse_events_sequence_failure_path():
    from services.generation_session_service import GenerationSessionService

    mock_db = SimpleNamespace(
        project=SimpleNamespace(
            find_unique=AsyncMock(
                return_value=SimpleNamespace(
                    id="p-001",
                    name="test-project",
                    description="test-description",
                )
            )
        ),
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(
                side_effect=[
                    {
                        "state": GenerationState.DRAFTING_OUTLINE.value,
                        "currentOutlineVersion": 0,
                    },
                    {
                        "state": GenerationState.DRAFTING_OUTLINE.value,
                        "currentOutlineVersion": 0,
                    },
                ]
            ),
            update=AsyncMock(),
        ),
        outlineversion=SimpleNamespace(create=AsyncMock()),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )
    service = GenerationSessionService(db=mock_db)

    with patch("services.generation_session_service.ai_service") as mock_ai:
        mock_ai.generate_outline = AsyncMock(
            side_effect=Exception("AI service unavailable")
        )
        await service._execute_outline_draft_local(
            session_id="s-001",
            project_id="p-001",
            options={"pages": 10},
        )

    event_calls = [
        call.kwargs["data"] for call in mock_db.sessionevent.create.await_args_list
    ]
    failed_events = [
        e
        for e in event_calls
        if e["eventType"] == GenerationEventType.TASK_FAILED.value
    ]
    assert len(failed_events) == 1
    failed_payload = json.loads(failed_events[0]["payload"])
    assert failed_payload["stage"] == "outline_draft"
    assert failed_payload["error_code"] == OutlineGenerationErrorCode.FAILED
    assert failed_payload["retryable"] is True
    assert "trace_id" in failed_payload
    assert "error_message" in failed_payload

    mock_db.outlineversion.create.assert_called_once()
    outline_data = mock_db.outlineversion.create.await_args.kwargs["data"]
    assert outline_data["version"] == 1
    assert outline_data["changeReason"] == "draft_failed_fallback_empty"
    outline_doc = json.loads(outline_data["outlineData"])
    assert outline_doc["nodes"] == []

    state_updates = [
        call.kwargs["data"]
        for call in mock_db.generationsession.update.await_args_list
        if "state" in (call.kwargs.get("data") or {})
    ]
    assert any(
        update.get("state") == GenerationState.AWAITING_OUTLINE_CONFIRM.value
        and update.get("stateReason")
        == OutlineGenerationStateReason.FAILED_FALLBACK_EMPTY
        for update in state_updates
    )


@pytest.mark.anyio
async def test_rq_fallback_to_local_when_worker_unavailable():
    from services.generation_session_service import GenerationSessionService

    service = GenerationSessionService(db=SimpleNamespace())
    mock_queue_service = Mock()
    mock_queue_service.get_queue_info = Mock(
        return_value={"workers": {"count": 0}, "queues": {}}
    )

    def _close_task(coro):
        coro.close()
        return Mock()

    with patch("asyncio.create_task", side_effect=_close_task) as mock_create_task:
        await service._schedule_outline_draft_task(
            session_id="s-001",
            project_id="p-001",
            options={"pages": 10},
            task_queue_service=mock_queue_service,
        )

    mock_create_task.assert_called_once()
    assert (
        not hasattr(mock_queue_service, "enqueue_outline_draft_task")
        or not mock_queue_service.enqueue_outline_draft_task.called
    )


@pytest.mark.anyio
async def test_idempotency_prevents_duplicate_creation(app):
    mock_project = SimpleNamespace(id="p-001", userId="u-001", name="test-project")
    cached_response = {
        "success": True,
        "data": {"session": {"session_id": "s-001"}},
        "message": "session created",
    }

    app.dependency_overrides[get_current_user] = lambda: "u-001"
    with patch.object(db_service, "get_project", AsyncMock(return_value=mock_project)):
        with patch.object(
            db_service,
            "get_idempotency_response",
            AsyncMock(return_value=cached_response),
        ):
            with patch.object(db_service, "db", SimpleNamespace()):
                client = TestClient(app)
                response = client.post(
                    "/api/v1/generate/sessions",
                    json={
                        "project_id": "p-001",
                        "output_type": SessionOutputType.PPT.value,
                    },
                    headers={"Idempotency-Key": "123e4567-e89b-12d3-a456-426614174000"},
                )

    app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["session"]["session_id"] == "s-001"


@pytest.mark.anyio
async def test_preview_response_contains_unified_artifact_anchor(app, _as_user):
    session_service = SimpleNamespace(
        get_session_snapshot=AsyncMock(
            return_value={
                "session": {
                    "state": GenerationState.SUCCESS.value,
                    "project_id": "p-001",
                    "render_version": 3,
                }
            }
        )
    )
    bound_artifact = SimpleNamespace(id="art-001", basedOnVersionId="ver-001")

    with patch(
        "routers.generate_sessions.preview._get_session_service",
        return_value=session_service,
    ):
        with patch(
            "routers.generate_sessions.preview._resolve_session_artifact_binding",
            AsyncMock(return_value=bound_artifact),
        ):
            with patch(
                "routers.generate_sessions.preview._load_preview_material",
                AsyncMock(
                    return_value=(
                        SimpleNamespace(id="task-001"),
                        [],
                        {"slides_plan": []},
                        {"markdown_content": ""},
                    )
                ),
            ):
                client = TestClient(app)
                response = client.get("/api/v1/generate/sessions/s-001/preview")

    assert response.status_code == 200
    body = response.json()
    anchor = body["data"]["artifact_anchor"]
    assert anchor == {
        "session_id": "s-001",
        "artifact_id": "art-001",
        "based_on_version_id": "ver-001",
    }
    assert body["data"]["artifact_id"] == "art-001"
    assert body["data"]["based_on_version_id"] == "ver-001"


@pytest.mark.anyio
async def test_export_response_contains_unified_artifact_anchor(app, _as_user):
    session_service = SimpleNamespace(
        get_session_snapshot=AsyncMock(
            return_value={
                "session": {
                    "state": GenerationState.SUCCESS.value,
                    "project_id": "p-001",
                    "render_version": 2,
                },
                "result": {"ppt_url": None, "word_url": None, "version": 2},
            }
        )
    )
    bound_artifact = SimpleNamespace(id="art-777", basedOnVersionId="ver-888")

    with patch(
        "routers.generate_sessions.preview._get_session_service",
        return_value=session_service,
    ):
        with patch(
            "routers.generate_sessions.preview._resolve_session_artifact_binding",
            AsyncMock(return_value=bound_artifact),
        ):
            with patch(
                "routers.generate_sessions.preview._load_preview_material",
                AsyncMock(
                    return_value=(
                        SimpleNamespace(id="task-777"),
                        [],
                        {"slides_plan": []},
                        {"markdown_content": "# hello"},
                    )
                ),
            ):
                client = TestClient(app)
                response = client.post(
                    "/api/v1/generate/sessions/s-001/preview/export",
                    json={"format": "markdown"},
                )

    assert response.status_code == 200
    body = response.json()
    anchor = body["data"]["artifact_anchor"]
    assert anchor == {
        "session_id": "s-001",
        "artifact_id": "art-777",
        "based_on_version_id": "ver-888",
    }
    assert body["data"]["artifact_id"] == "art-777"
    assert body["data"]["based_on_version_id"] == "ver-888"


@pytest.mark.anyio
async def test_get_capabilities_includes_studio_card_readiness(app, _as_user):
    client = TestClient(app)

    response = client.get("/api/v1/generate/capabilities")

    assert response.status_code == 200
    data = response.json()["data"]
    studio_cards = {card["id"]: card for card in data["studio_cards"]}

    assert studio_cards["word_document"]["primary_capabilities"] == ["word", "handout"]
    assert studio_cards["interactive_games"]["readiness"] == "foundation_ready"
    assert studio_cards["classroom_qa_simulator"]["readiness"] == "foundation_ready"
    assert studio_cards["classroom_qa_simulator"]["context_mode"] == "hybrid"
    assert studio_cards["speaker_notes"]["requires_source_artifact"] is True
    assert studio_cards["word_document"]["session_output_type"] == "word"
    assert studio_cards["knowledge_mindmap"]["supports_selection_context"] is True


@pytest.mark.anyio
async def test_get_studio_cards_returns_card_protocol_catalog(app, _as_user):
    client = TestClient(app)

    response = client.get("/api/v1/generate/studio-cards")

    assert response.status_code == 200
    data = response.json()["data"]
    cards = {card["id"]: card for card in data["studio_cards"]}

    assert cards["word_document"]["execution_mode"] == "composite"
    assert (
        cards["interactive_quick_quiz"]["config_fields"][0]["key"] == "question_count"
    )
    assert cards["speaker_notes"]["config_fields"][0]["type"] == "reference"


@pytest.mark.anyio
async def test_get_studio_card_returns_protocol_detail(app, _as_user):
    client = TestClient(app)

    response = client.get("/api/v1/generate/studio-cards/word_document")

    assert response.status_code == 200
    card = response.json()["data"]["studio_card"]
    assert card["id"] == "word_document"
    assert card["session_output_type"] == "word"
    assert card["supports_chat_refine"] is True


@pytest.mark.anyio
async def test_get_studio_card_returns_404_for_unknown_card(app, _as_user):
    client = TestClient(app)

    response = client.get("/api/v1/generate/studio-cards/unknown_card")

    assert response.status_code == 404
    payload = response.json()
    assert payload["detail"]["code"] == "NOT_FOUND"


@pytest.mark.anyio
async def test_get_studio_card_execution_plan_returns_protocol_bindings(app, _as_user):
    client = TestClient(app)

    response = client.get("/api/v1/generate/studio-cards/word_document/execution-plan")

    assert response.status_code == 200
    plan = response.json()["data"]["execution_plan"]
    assert plan["card_id"] == "word_document"
    assert plan["initial_binding"]["transport"] == "session_create"
    assert plan["initial_binding"]["status"] == "ready"
    assert plan["initial_binding"]["endpoint"] == "/api/v1/generate/sessions"
    assert "document_variant" in plan["initial_binding"]["bound_config_keys"]
    assert plan["refine_binding"]["transport"] == "chat_message"


@pytest.mark.anyio
async def test_get_studio_card_execution_plan_returns_source_binding_when_needed(
    app, _as_user
):
    client = TestClient(app)

    response = client.get("/api/v1/generate/studio-cards/speaker_notes/execution-plan")

    assert response.status_code == 200
    plan = response.json()["data"]["execution_plan"]
    assert plan["source_binding"]["transport"] == "artifact_reference"
    assert plan["source_binding"]["status"] == "ready"
    assert (
        plan["source_binding"]["endpoint"]
        == "/api/v1/generate/studio-cards/{card_id}/sources"
    )


@pytest.mark.anyio
async def test_get_studio_card_execution_plan_returns_404_for_unknown_card(
    app, _as_user
):
    client = TestClient(app)

    response = client.get("/api/v1/generate/studio-cards/unknown/execution-plan")

    assert response.status_code == 404
    payload = response.json()
    assert payload["detail"]["code"] == "NOT_FOUND"


@pytest.mark.anyio
async def test_preview_studio_card_execution_returns_bound_word_payload(app, _as_user):
    client = TestClient(app)

    response = client.post(
        "/api/v1/generate/studio-cards/word_document/execution-preview",
        json={
            "project_id": "p-001",
            "config": {
                "document_variant": "student_handout",
                "teaching_model": "scaffolded",
                "grade_band": "high",
            },
        },
    )

    assert response.status_code == 200
    preview = response.json()["data"]["execution_preview"]
    assert preview["initial_request"]["endpoint"] == "/api/v1/generate/sessions"
    assert preview["initial_request"]["payload"]["output_type"] == "word"
    assert (
        preview["initial_request"]["payload"]["options"]["document_variant"]
        == "student_handout"
    )


@pytest.mark.anyio
async def test_preview_studio_card_execution_returns_bound_quiz_payload(app, _as_user):
    client = TestClient(app)

    response = client.post(
        "/api/v1/generate/studio-cards/interactive_quick_quiz/execution-preview",
        json={
            "project_id": "p-001",
            "visibility": "project-visible",
            "config": {
                "question_count": 8,
                "difficulty": "hard",
                "humorous_distractors": True,
            },
        },
    )

    assert response.status_code == 200
    preview = response.json()["data"]["execution_preview"]
    assert preview["initial_request"]["endpoint"] == "/api/v1/projects/p-001/artifacts"
    assert preview["initial_request"]["payload"]["type"] == "exercise"
    assert preview["initial_request"]["payload"]["visibility"] == "project-visible"
    assert preview["initial_request"]["payload"]["content"]["question_count"] == 8
    assert preview["initial_request"]["payload"]["content"]["difficulty"] == "hard"


@pytest.mark.anyio
async def test_preview_studio_card_execution_returns_bound_classroom_payload(
    app, _as_user
):
    client = TestClient(app)

    response = client.post(
        "/api/v1/generate/studio-cards/classroom_qa_simulator/execution-preview",
        json={
            "project_id": "p-001",
            "visibility": "project-visible",
            "config": {
                "student_profiles": ["strong_divergent", "formula_driven"],
                "question_focus": "底层公式推导",
                "turns": 4,
            },
        },
    )

    assert response.status_code == 200
    preview = response.json()["data"]["execution_preview"]
    assert preview["initial_request"]["endpoint"] == "/api/v1/projects/p-001/artifacts"
    assert preview["initial_request"]["payload"]["type"] == "summary"
    assert preview["initial_request"]["payload"]["content"]["kind"] == (
        "classroom_qa_simulator"
    )
    assert preview["initial_request"]["payload"]["content"]["turns"] == 4


@pytest.mark.anyio
async def test_preview_studio_card_execution_returns_bound_interactive_game_refine_payload(
    app, _as_user
):
    client = TestClient(app)

    response = client.post(
        "/api/v1/generate/studio-cards/interactive_games/execution-preview",
        json={
            "project_id": "p-001",
            "config": {
                "game_pattern": "concept_match",
                "sandbox_patch": {"replace": ["规则说明"]},
            },
        },
    )

    assert response.status_code == 200
    preview = response.json()["data"]["execution_preview"]
    assert preview["refine_request"]["endpoint"] == "/api/v1/chat/messages"
    metadata = preview["refine_request"]["payload"]["metadata"]
    assert metadata["card_id"] == "interactive_games"
    assert metadata["game_pattern"] == "concept_match"
    assert metadata["sandbox_patch"] == {"replace": ["规则说明"]}


@pytest.mark.anyio
async def test_preview_studio_card_execution_returns_bound_speaker_notes_refine_payload(
    app, _as_user
):
    client = TestClient(app)

    response = client.post(
        "/api/v1/generate/studio-cards/speaker_notes/execution-preview",
        json={
            "project_id": "p-001",
            "source_artifact_id": "a-ppt-001",
            "config": {"selected_script_segment": "slide-3:transition"},
        },
    )

    assert response.status_code == 200
    preview = response.json()["data"]["execution_preview"]
    assert preview["refine_request"]["endpoint"] == "/api/v1/chat/messages"
    assert preview["refine_request"]["payload"]["metadata"]["source_artifact_id"] == (
        "a-ppt-001"
    )
    assert (
        preview["refine_request"]["payload"]["metadata"]["selected_script_segment"]
        == "slide-3:transition"
    )


@pytest.mark.anyio
async def test_preview_studio_card_execution_requires_project_id(app, _as_user):
    client = TestClient(app)

    response = client.post(
        "/api/v1/generate/studio-cards/word_document/execution-preview",
        json={"config": {}},
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["detail"]["code"] == "INVALID_INPUT"


@pytest.mark.anyio
async def test_execute_studio_card_creates_word_session(app, _as_user):
    client = TestClient(app)
    session_ref = {
        "session_id": "s-card-001",
        "project_id": "p-001",
        "output_type": "word",
        "state": GenerationState.DRAFTING_OUTLINE.value,
    }

    with (
        patch(
            "services.generation_session_service.GenerationSessionService.create_session",
            AsyncMock(return_value=session_ref),
        ) as create_session_mock,
        patch(
            "services.generation_session_service.card_execution_runtime.get_owned_project",
            AsyncMock(return_value=SimpleNamespace(id="p-001", userId="u-001")),
        ),
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/word_document/execute",
            json={
                "project_id": "p-001",
                "client_session_id": "client-card-001",
                "config": {
                    "document_variant": "student_handout",
                    "teaching_model": "scaffolded",
                    "grade_band": "high",
                },
            },
        )

    assert response.status_code == 200
    result = response.json()["data"]["execution_result"]
    assert result["resource_kind"] == "session"
    assert result["session"]["session_id"] == "s-card-001"
    assert result["request_preview"]["payload"]["options"]["document_variant"] == (
        "student_handout"
    )
    create_session_mock.assert_awaited_once()
    kwargs = create_session_mock.await_args.kwargs
    assert kwargs["output_type"] == "word"
    assert kwargs["client_session_id"] == "client-card-001"
    assert kwargs["options"]["document_variant"] == "student_handout"


@pytest.mark.anyio
async def test_execute_studio_card_creates_quiz_artifact(app, _as_user):
    client = TestClient(app)
    artifact = SimpleNamespace(
        id="a-card-001",
        projectId="p-001",
        sessionId=None,
        basedOnVersionId=None,
        ownerUserId="u-001",
        type="exercise",
        visibility="project-visible",
        storagePath="uploads/artifacts/a-card-001.json",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
    )

    with (
        patch(
            "services.project_space_service.project_space_service.check_project_permission",
            AsyncMock(),
        ),
        patch(
            "services.project_space_service.project_space_service.create_artifact_with_file",
            AsyncMock(return_value=artifact),
        ) as create_artifact_mock,
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/interactive_quick_quiz/execute",
            json={
                "project_id": "p-001",
                "visibility": "project-visible",
                "config": {
                    "question_count": 8,
                    "difficulty": "hard",
                    "humorous_distractors": True,
                },
            },
        )

    assert response.status_code == 200
    result = response.json()["data"]["execution_result"]
    assert result["resource_kind"] == "artifact"
    assert result["artifact"]["id"] == "a-card-001"
    assert result["artifact"]["type"] == "exercise"
    create_artifact_mock.assert_awaited_once()
    kwargs = create_artifact_mock.await_args.kwargs
    assert kwargs["artifact_type"] == "exercise"
    assert kwargs["visibility"] == "project-visible"
    assert kwargs["content"]["question_count"] == 8


@pytest.mark.anyio
async def test_execute_studio_card_rejects_protocol_pending_card(app, _as_user):
    client = TestClient(app)

    response = client.post(
        "/api/v1/generate/studio-cards/unknown_pending_card/execute",
        json={"project_id": "p-001", "config": {}},
    )

    assert response.status_code == 404
    payload = response.json()
    assert payload["detail"]["code"] == "NOT_FOUND"


@pytest.mark.anyio
async def test_execute_studio_card_creates_interactive_game_artifact(app, _as_user):
    client = TestClient(app)
    artifact = SimpleNamespace(
        id="a-game-001",
        projectId="p-001",
        sessionId=None,
        basedOnVersionId=None,
        ownerUserId="u-001",
        type="html",
        visibility="shared",
        storagePath="uploads/artifacts/a-game-001.html",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
    )

    with (
        patch(
            "services.project_space_service.project_space_service.check_project_permission",
            AsyncMock(),
        ),
        patch(
            "services.project_space_service.project_space_service.create_artifact_with_file",
            AsyncMock(return_value=artifact),
        ) as create_artifact_mock,
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/interactive_games/execute",
            json={
                "project_id": "p-001",
                "visibility": "shared",
                "config": {
                    "game_pattern": "concept_match",
                    "creative_brief": "围绕牛顿三定律生成连线游戏",
                },
            },
        )

    assert response.status_code == 200
    result = response.json()["data"]["execution_result"]
    assert result["resource_kind"] == "artifact"
    assert result["artifact"]["id"] == "a-game-001"
    assert result["artifact"]["type"] == "html"
    kwargs = create_artifact_mock.await_args.kwargs
    assert kwargs["artifact_type"] == "html"
    assert kwargs["visibility"] == "shared"
    assert kwargs["content"]["kind"] == "interactive_game"
    assert kwargs["content"]["game_pattern"] == "concept_match"


@pytest.mark.anyio
async def test_execute_studio_card_creates_classroom_simulator_artifact(app, _as_user):
    client = TestClient(app)
    artifact = SimpleNamespace(
        id="a-sim-001",
        projectId="p-001",
        sessionId=None,
        basedOnVersionId=None,
        ownerUserId="u-001",
        type="summary",
        visibility="project-visible",
        storagePath="uploads/artifacts/a-sim-001.json",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
    )

    with (
        patch(
            "services.project_space_service.project_space_service.check_project_permission",
            AsyncMock(),
        ),
        patch(
            "services.project_space_service.project_space_service.create_artifact_with_file",
            AsyncMock(return_value=artifact),
        ) as create_artifact_mock,
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/classroom_qa_simulator/execute",
            json={
                "project_id": "p-001",
                "visibility": "project-visible",
                "config": {
                    "student_profiles": ["confused_foundation"],
                    "question_focus": "常见易错点",
                    "turns": 2,
                },
            },
        )

    assert response.status_code == 200
    result = response.json()["data"]["execution_result"]
    assert result["resource_kind"] == "artifact"
    assert result["artifact"]["id"] == "a-sim-001"
    assert result["artifact"]["type"] == "summary"
    kwargs = create_artifact_mock.await_args.kwargs
    assert kwargs["artifact_type"] == "summary"
    assert kwargs["content"]["kind"] == "classroom_qa_simulator"
    assert kwargs["content"]["question_focus"] == "常见易错点"


@pytest.mark.anyio
async def test_get_studio_card_sources_returns_matching_artifacts(app, _as_user):
    client = TestClient(app)
    artifact = SimpleNamespace(
        id="a-ppt-001",
        type="pptx",
        metadata={"title": "牛顿定律课件"},
        visibility="project-visible",
        basedOnVersionId="v-001",
        sessionId="s-001",
        updatedAt=datetime.now(timezone.utc),
    )

    with (
        patch(
            "services.project_space_service.project_space_service.check_project_permission",
            AsyncMock(),
        ),
        patch(
            "services.project_space_service.project_space_service.get_project_artifacts",
            AsyncMock(return_value=[artifact]),
        ) as get_project_artifacts_mock,
    ):
        response = client.get(
            "/api/v1/generate/studio-cards/speaker_notes/sources?project_id=p-001"
        )

    assert response.status_code == 200
    sources = response.json()["data"]["sources"]
    assert sources[0]["id"] == "a-ppt-001"
    assert sources[0]["type"] == "pptx"
    assert sources[0]["title"] == "牛顿定律课件"
    get_project_artifacts_mock.assert_awaited_once()


@pytest.mark.anyio
async def test_get_studio_card_sources_rejects_cards_without_source_binding(
    app, _as_user
):
    client = TestClient(app)

    response = client.get(
        "/api/v1/generate/studio-cards/word_document/sources?project_id=p-001"
    )

    assert response.status_code == 409
    payload = response.json()
    assert payload["detail"]["code"] == "RESOURCE_CONFLICT"


@pytest.mark.anyio
async def test_execute_studio_card_creates_speaker_notes_session(app, _as_user):
    client = TestClient(app)
    session_ref = {
        "session_id": "s-speaker-001",
        "project_id": "p-001",
        "output_type": "ppt",
        "state": GenerationState.DRAFTING_OUTLINE.value,
    }
    source_artifact = SimpleNamespace(id="a-ppt-001", projectId="p-001", type="pptx")

    with (
        patch(
            "services.generation_session_service.card_execution_runtime.get_owned_project",
            AsyncMock(return_value=SimpleNamespace(id="p-001", userId="u-001")),
        ),
        patch(
            "services.project_space_service.project_space_service.get_artifact",
            AsyncMock(return_value=source_artifact),
        ),
        patch(
            "services.generation_session_service.GenerationSessionService.create_session",
            AsyncMock(return_value=session_ref),
        ) as create_session_mock,
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/speaker_notes/execute",
            json={
                "project_id": "p-001",
                "source_artifact_id": "a-ppt-001",
            },
        )

    assert response.status_code == 200
    result = response.json()["data"]["execution_result"]
    assert result["resource_kind"] == "session"
    assert result["session"]["session_id"] == "s-speaker-001"
    kwargs = create_session_mock.await_args.kwargs
    assert kwargs["output_type"] == "ppt"
    assert kwargs["options"]["source_artifact_id"] == "a-ppt-001"


@pytest.mark.anyio
async def test_execute_studio_card_requires_source_artifact_for_speaker_notes(
    app, _as_user
):
    client = TestClient(app)

    with patch(
        "services.generation_session_service.card_execution_runtime.get_owned_project",
        AsyncMock(return_value=SimpleNamespace(id="p-001", userId="u-001")),
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/speaker_notes/execute",
            json={"project_id": "p-001"},
        )

    assert response.status_code == 400
    payload = response.json()
    assert payload["detail"]["code"] == "INVALID_INPUT"


@pytest.mark.anyio
async def test_refine_studio_card_routes_through_chat_metadata(app, _as_user):
    client = TestClient(app)
    response_payload = {
        "success": True,
        "data": {
            "session_id": "s-001",
            "message": {
                "id": "m-001",
                "role": "assistant",
                "content": "已改写过渡语",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "citations": [],
            },
            "rag_hit": False,
            "suggestions": ["继续优化"],
            "observability": {"route_task": "chat_response"},
        },
        "message": "消息发送成功",
    }

    with patch(
        "routers.generate_sessions.studio_cards.process_chat_message",
        AsyncMock(return_value=response_payload),
    ) as process_mock:
        response = client.post(
            "/api/v1/generate/studio-cards/speaker_notes/refine",
            json={
                "project_id": "p-001",
                "message": "把这一段改得更自然一些",
                "source_artifact_id": "a-ppt-001",
                "config": {"selected_script_segment": "slide-3:transition"},
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["message"] == "Studio 卡片 refine 成功"
    assert body["data"]["card_id"] == "speaker_notes"
    assert body["data"]["refine_request"]["endpoint"] == "/api/v1/chat/messages"
    chat_body = process_mock.await_args.args[0]
    assert chat_body.metadata["source_artifact_id"] == "a-ppt-001"
    assert chat_body.metadata["selected_script_segment"] == "slide-3:transition"


@pytest.mark.anyio
async def test_refine_studio_card_rejects_cards_without_refine_protocol(app, _as_user):
    client = TestClient(app)

    with patch(
        "routers.generate_sessions.studio_cards.build_studio_card_execution_preview",
        return_value=SimpleNamespace(refine_request=None),
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/word_document/refine",
            json={"project_id": "p-001", "message": "请改写"},
        )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "RESOURCE_CONFLICT"
