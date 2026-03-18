from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from main import app
from routers import generate_sessions as generate_sessions_router
from utils.dependencies import get_current_user

_USER_ID = "u-snapshot-001"


@pytest.fixture()
def _as_user():
    app.dependency_overrides[get_current_user] = lambda: _USER_ID
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _snapshot_payload():
    return {
        "session": {
            "session_id": "s-snapshot-001",
            "project_id": "p-snapshot-001",
            "state": "SUCCESS",
            "render_version": 3,
        },
        "artifact_id": "art-summary-003",
        "based_on_version_id": "ver-003",
        "artifact_anchor": {
            "session_id": "s-snapshot-001",
            "artifact_id": "art-summary-003",
            "based_on_version_id": "ver-003",
        },
        "session_artifacts": [
            {
                "artifact_id": "art-summary-003",
                "capability": "summary",
                "title": "总结",
                "based_on_version_id": "ver-003",
                "updated_at": "2026-03-18T08:00:00Z",
                "artifact_anchor": {
                    "session_id": "s-snapshot-001",
                    "artifact_id": "art-summary-003",
                    "based_on_version_id": "ver-003",
                },
            }
        ],
        "session_artifact_groups": [
            {
                "capability": "summary",
                "items": [
                    {
                        "artifact_id": "art-summary-003",
                        "capability": "summary",
                        "title": "总结",
                        "based_on_version_id": "ver-003",
                        "updated_at": "2026-03-18T08:00:00Z",
                        "artifact_anchor": {
                            "session_id": "s-snapshot-001",
                            "artifact_id": "art-summary-003",
                            "based_on_version_id": "ver-003",
                        },
                    }
                ],
            }
        ],
    }


def test_get_session_snapshot_includes_anchor_and_history(
    client, monkeypatch, _as_user
):
    svc = SimpleNamespace(
        get_session_snapshot=AsyncMock(return_value=_snapshot_payload())
    )
    monkeypatch.setattr(generate_sessions_router, "_get_session_service", lambda: svc)

    resp = client.get("/api/v1/generate/sessions/s-snapshot-001")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["artifact_id"] == "art-summary-003"
    assert body["data"]["based_on_version_id"] == "ver-003"
    assert body["data"]["artifact_anchor"]["session_id"] == "s-snapshot-001"
    assert body["data"]["session_artifacts"][0]["artifact_anchor"]["artifact_id"] == (
        "art-summary-003"
    )
    assert body["data"]["session_artifact_groups"][0]["capability"] == "summary"
