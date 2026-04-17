from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers.generate_sessions import router as generate_sessions_router
from utils.dependencies import get_current_user, get_current_user_optional

_USER_ID = "u-studio-001"


def _build_test_app() -> FastAPI:
    app = FastAPI()
    app.state.task_queue_service = None
    app.include_router(generate_sessions_router, prefix="/api/v1")
    return app


@pytest.fixture()
def app():
    return _build_test_app()


@pytest.fixture()
def _as_user(app):
    app.dependency_overrides[get_current_user] = lambda: _USER_ID
    app.dependency_overrides[get_current_user_optional] = lambda: _USER_ID
    yield
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_current_user_optional, None)


class _ExecutionResult:
    def __init__(self, payload: dict):
        self._payload = payload

    def model_dump(self, mode: str = "python") -> dict:
        return self._payload


def test_get_studio_card_sources_contract_includes_version_flags(app, _as_user):
    client = TestClient(app)
    current_artifact = SimpleNamespace(
        id="a-ppt-010",
        type="pptx",
        metadata={"title": "当前课件", "is_current": True},
        visibility="project-visible",
        basedOnVersionId="v-current",
        sessionId="s-010",
        updatedAt=datetime(2026, 4, 9, 10, 0, tzinfo=timezone.utc),
    )
    superseded_artifact = SimpleNamespace(
        id="a-ppt-009",
        type="pptx",
        metadata={
            "title": "旧课件",
            "is_current": False,
            "superseded_by_artifact_id": "a-ppt-010",
        },
        visibility="project-visible",
        basedOnVersionId="v-old",
        sessionId="s-009",
        updatedAt=datetime(2026, 4, 9, 11, 0, tzinfo=timezone.utc),
    )

    with (
        patch(
            "services.project_space_service.project_space_service.check_project_permission",
            AsyncMock(),
        ),
        patch(
            "services.project_space_service.project_space_service.get_project_artifacts",
            AsyncMock(return_value=[superseded_artifact, current_artifact]),
        ),
    ):
        response = client.get(
            "/api/v1/generate/studio-cards/speaker_notes/sources?project_id=p-001"
        )

    assert response.status_code == 200
    sources = response.json()["data"]["sources"]
    assert [source["id"] for source in sources] == ["a-ppt-010", "a-ppt-009"]
    assert sources[0]["based_on_version_id"] == "v-current"
    assert sources[1]["superseded_by_artifact_id"] == "a-ppt-010"
    assert sources[0]["is_current"] is True
    assert sources[0]["current_version_id"] is None
    assert sources[0]["upstream_updated"] is False


def test_execute_studio_card_contract_omits_legacy_flags(app, _as_user):
    client = TestClient(app)
    execution_result = _ExecutionResult(
        {
            "resource_kind": "artifact",
            "artifact": {
                "id": "a-summary-001",
                "type": "summary",
                "based_on_version_id": "v-001",
                "artifact_anchor": {
                    "artifact_id": "a-summary-001",
                    "artifact_type": "summary",
                },
                "replaces_artifact_id": "a-summary-000",
                "superseded_by_artifact_id": None,
            },
        }
    )

    with (
        patch(
            "routers.generate_sessions.studio_cards.execute_studio_card_initial_request",
            AsyncMock(return_value=execution_result),
        ),
        patch(
            "routers.generate_sessions.studio_cards.get_session_service",
            return_value=SimpleNamespace(),
        ),
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/speaker_notes/execute",
            json={
                "project_id": "p-001",
                "source_artifact_id": "a-ppt-001",
                "visibility": "project-visible",
                "config": {"topic": "函数单调性公开课说课"},
            },
        )

    assert response.status_code == 200
    artifact = response.json()["data"]["execution_result"]["artifact"]
    assert artifact["id"] == "a-summary-001"
    assert artifact["based_on_version_id"] == "v-001"
    assert artifact["replaces_artifact_id"] == "a-summary-000"
    assert "is_current" not in artifact
    assert "current_version_id" not in artifact
    assert "upstream_updated" not in artifact
