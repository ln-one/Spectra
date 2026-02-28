"""Projects API contract tests for C6 scope."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from main import app
from services import db_service
from utils.dependencies import get_current_user

_NOW = datetime.now(timezone.utc)
_USER_ID = "u-001"
_PROJECT_ID = "p-001"


@pytest.fixture()
def _as_user():
    app.dependency_overrides[get_current_user] = lambda: _USER_ID
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _fake_project(user_id=_USER_ID, **kw):
    data = dict(
        id=_PROJECT_ID,
        userId=user_id,
        name="Project A",
        description="desc",
        createdAt=_NOW,
        updatedAt=_NOW,
    )
    data.update(kw)
    return SimpleNamespace(**data)


def _mock(mp, obj, attr, rv=None):
    mp.setattr(obj, attr, AsyncMock(return_value=rv))


def test_get_projects_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_projects_by_user", [_fake_project()])
    _mock(monkeypatch, db_service, "count_projects_by_user", 1)

    resp = client.get("/api/v1/projects?page=1&limit=20")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["total"] == 1
    assert len(body["data"]["projects"]) == 1


def test_get_projects_no_token_401(client):
    resp = client.get("/api/v1/projects")
    assert resp.status_code == 401


def test_get_project_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())

    resp = client.get(f"/api/v1/projects/{_PROJECT_ID}")
    assert resp.status_code == 200
    assert resp.json()["data"]["project"]["id"] == _PROJECT_ID


def test_get_project_not_found_404(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", None)

    resp = client.get(f"/api/v1/projects/{_PROJECT_ID}")
    assert resp.status_code == 404


def test_get_project_forbidden_403(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project(user_id="other"))

    resp = client.get(f"/api/v1/projects/{_PROJECT_ID}")
    assert resp.status_code == 403


def test_search_projects_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "search_projects", [_fake_project()])
    _mock(monkeypatch, db_service, "count_search_projects", 1)

    resp = client.get("/api/v1/projects/search?q=Project&page=1&limit=20")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["total"] == 1


def test_search_projects_missing_q_400(client, _as_user):
    resp = client.get("/api/v1/projects/search")
    assert resp.status_code == 400


def test_update_project_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    _mock(monkeypatch, db_service, "update_project", _fake_project(name="Updated"))

    resp = client.put(
        f"/api/v1/projects/{_PROJECT_ID}",
        json={"name": "Updated", "description": "new desc", "grade_level": "G10"},
        headers={"Idempotency-Key": "00000000-0000-0000-0000-000000000111"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["project"]["name"] == "Updated"


def test_update_project_invalid_idempotency_key_400(client, _as_user):
    resp = client.put(
        f"/api/v1/projects/{_PROJECT_ID}",
        json={"name": "N", "description": "D"},
        headers={"Idempotency-Key": "invalid"},
    )
    assert resp.status_code == 400


def test_update_project_not_found_404(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", None)

    resp = client.put(
        f"/api/v1/projects/{_PROJECT_ID}",
        json={"name": "Updated", "description": "new desc"},
    )
    assert resp.status_code == 404


def test_update_project_forbidden_403(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project(user_id="other"))

    resp = client.put(
        f"/api/v1/projects/{_PROJECT_ID}",
        json={"name": "Updated", "description": "new desc"},
    )
    assert resp.status_code == 403


def test_delete_project_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    _mock(monkeypatch, db_service, "delete_project", _fake_project())

    resp = client.delete(f"/api/v1/projects/{_PROJECT_ID}")
    assert resp.status_code == 200
    assert resp.json()["success"] is True


def test_delete_project_not_found_404(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", None)

    resp = client.delete(f"/api/v1/projects/{_PROJECT_ID}")
    assert resp.status_code == 404


def test_delete_project_forbidden_403(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project(user_id="other"))

    resp = client.delete(f"/api/v1/projects/{_PROJECT_ID}")
    assert resp.status_code == 403


def test_project_statistics_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    _mock(
        monkeypatch,
        db_service,
        "get_project_statistics",
        {
            "project_id": _PROJECT_ID,
            "files_count": 2,
            "messages_count": 3,
            "generation_tasks_count": 4,
            "completed_tasks_count": 1,
            "total_file_size": 1024,
            "last_activity": _NOW,
            "created_at": _NOW,
        },
    )

    resp = client.get(f"/api/v1/projects/{_PROJECT_ID}/statistics")
    assert resp.status_code == 200
    assert resp.json()["data"]["project_id"] == _PROJECT_ID


def test_project_statistics_forbidden_403(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project(user_id="other"))

    resp = client.get(f"/api/v1/projects/{_PROJECT_ID}/statistics")
    assert resp.status_code == 403
