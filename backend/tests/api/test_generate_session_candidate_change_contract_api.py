from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from main import app
from routers import generate_sessions as generate_sessions_router
from services.project_space_service import project_space_service
from utils.dependencies import get_current_user

_USER_ID = "u-candidate-001"


@pytest.fixture()
def _as_user():
    app.dependency_overrides[get_current_user] = lambda: _USER_ID
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _snapshot():
    return {
        "session": {
            "session_id": "s-candidate-001",
            "project_id": "p-candidate-001",
            "state": "SUCCESS",
            "render_version": 4,
        },
        "session_artifacts": [
            {
                "artifact_id": "a-001",
                "capability": "summary",
                "title": "summary",
                "artifact_anchor": {
                    "session_id": "s-candidate-001",
                    "artifact_id": "a-001",
                    "based_on_version_id": "v-010",
                },
            }
        ],
        "result": {"ppt_url": "uploads/demo.pptx"},
        "outline": {"version": 1, "nodes": []},
    }


def _fake_change(payload: str):
    return SimpleNamespace(
        id="c-001",
        projectId="p-candidate-001",
        title="session-candidate",
        summary="summary",
        payload=payload,
        sessionId="s-candidate-001",
        baseVersionId="v-010",
        status="pending",
        reviewComment=None,
        proposerUserId=_USER_ID,
        createdAt="2026-03-18T09:00:00Z",
        updatedAt="2026-03-18T09:00:00Z",
    )


def test_submit_session_candidate_change_success(client, monkeypatch, _as_user):
    svc = SimpleNamespace(get_session_snapshot=AsyncMock(return_value=_snapshot()))
    monkeypatch.setattr(generate_sessions_router, "_get_session_service", lambda: svc)
    monkeypatch.setattr(
        generate_sessions_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-001", basedOnVersionId="v-010")),
    )
    create_change = AsyncMock(return_value=_fake_change('{"review":{}}'))
    monkeypatch.setattr(project_space_service, "create_candidate_change", create_change)

    resp = client.post(
        "/api/v1/generate/sessions/s-candidate-001/candidate-change",
        json={"title": "session-candidate", "summary": "summary"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["change"]["session_id"] == "s-candidate-001"
    assert body["data"]["change"]["base_version_id"] == "v-010"
    create_change.assert_awaited_once()
    kwargs = create_change.await_args.kwargs
    assert kwargs["project_id"] == "p-candidate-001"
    assert kwargs["session_id"] == "s-candidate-001"
    assert kwargs["base_version_id"] == "v-010"
    assert kwargs["payload"]["artifact_anchor"]["artifact_id"] == "a-001"


def test_submit_session_candidate_change_rejects_non_object_payload(
    client, monkeypatch, _as_user
):
    resp = client.post(
        "/api/v1/generate/sessions/s-candidate-001/candidate-change",
        json={"payload": "invalid"},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INVALID_INPUT"
