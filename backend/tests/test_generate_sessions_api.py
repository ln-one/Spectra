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
        generationsession=SimpleNamespace(
            create=AsyncMock(return_value=mock_session),
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
