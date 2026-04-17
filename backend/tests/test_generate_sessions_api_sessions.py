from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers.generate_sessions import router as generate_sessions_router
from utils.dependencies import get_current_user, get_current_user_optional


def _build_test_app() -> FastAPI:
    app = FastAPI()
    app.state.task_queue_service = None
    app.include_router(generate_sessions_router, prefix="/api/v1")
    return app


@pytest.fixture
def app():
    return _build_test_app()


@pytest.fixture()
def _as_user(app):
    app.dependency_overrides[get_current_user] = lambda: "u-001"
    app.dependency_overrides[get_current_user_optional] = lambda: "u-001"
    yield
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_current_user_optional, None)


@pytest.mark.anyio
async def test_create_session_rejects_direct_non_bootstrap_start(app, _as_user):
    client = TestClient(app)
    with (
        patch(
            "services.database.db_service.get_project",
            AsyncMock(return_value=SimpleNamespace(id="p-001", userId="u-001")),
        ),
    ):
        response = client.post(
            "/api/v1/generate/sessions",
            json={
                "project_id": "p-001",
                "output_type": "ppt",
                "client_session_id": "s-001",
            },
        )

    assert response.status_code == 409
    payload = response.json()
    assert payload["detail"]["details"]["reason"] == "direct_generation_start_removed"


@pytest.mark.anyio
async def test_session_events_support_accept_header_json(app, _as_user):
    client = TestClient(app)
    service = SimpleNamespace(
        get_session_runtime_state=AsyncMock(
            return_value={
                "state": "RENDERING",
                "last_cursor": "cur-001",
                "updated_at": datetime.now(timezone.utc),
            }
        ),
        get_events=AsyncMock(return_value=[{"cursor": "cur-001"}]),
    )

    with patch(
        "routers.generate_sessions.core.get_session_service", return_value=service
    ):
        response = client.get(
            "/api/v1/generate/sessions/s-001/events",
            headers={"Accept": "application/json"},
        )

    assert response.status_code == 200
    assert response.json()["data"]["events"][0]["cursor"] == "cur-001"
    service.get_events.assert_awaited_once_with(
        "s-001",
        "u-001",
        cursor=None,
        limit=50,
    )


@pytest.mark.anyio
async def test_session_events_json_forwards_limit_query(app, _as_user):
    client = TestClient(app)
    service = SimpleNamespace(
        get_session_runtime_state=AsyncMock(
            return_value={
                "state": "RENDERING",
                "last_cursor": "cur-001",
                "updated_at": datetime.now(timezone.utc),
            }
        ),
        get_events=AsyncMock(return_value=[{"cursor": "cur-003"}]),
    )

    with patch(
        "routers.generate_sessions.core.get_session_service", return_value=service
    ):
        response = client.get(
            "/api/v1/generate/sessions/s-001/events?accept=application/json&limit=120",
        )

    assert response.status_code == 200
    assert response.json()["data"]["events"][0]["cursor"] == "cur-003"
    service.get_events.assert_awaited_once_with(
        "s-001",
        "u-001",
        cursor=None,
        limit=120,
    )


@pytest.mark.anyio
async def test_preview_studio_card_execution_requires_project_id(app, _as_user):
    client = TestClient(app)
    response = client.post(
        "/api/v1/generate/studio-cards/word_document/execution-preview",
        json={"config": {}},
    )
    assert response.status_code == 400
