"""Preview API contract tests for C10 scope."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from main import app
from services.database import db_service
from utils.dependencies import get_current_user

_NOW = datetime.now(timezone.utc)
_USER_ID = "u-001"
_PROJECT_ID = "p-001"
_TASK_ID = "t-001"


@pytest.fixture()
def _as_user():
    app.dependency_overrides[get_current_user] = lambda: _USER_ID
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _mock(mp, obj, attr, rv=None):
    mp.setattr(obj, attr, AsyncMock(return_value=rv))


def _fake_project(project_id=_PROJECT_ID, user_id=_USER_ID):
    return SimpleNamespace(id=project_id, userId=user_id, name="Project A")


def _fake_task(task_id=_TASK_ID, project_id=_PROJECT_ID, **kw):
    data = dict(
        id=task_id,
        projectId=project_id,
        taskType="pptx",
        status="completed",
        progress=100,
        createdAt=_NOW,
        updatedAt=_NOW,
    )
    data.update(kw)
    return SimpleNamespace(**data)


def test_get_preview_by_task_id_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_generation_task", _fake_task())
    _mock(monkeypatch, db_service, "get_project", _fake_project())

    resp = client.get(f"/api/v1/preview/{_TASK_ID}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["task_id"] == _TASK_ID
    assert len(body["data"]["slides"]) >= 1


def test_get_preview_by_project_id_fallback_success(client, monkeypatch, _as_user):
    async def get_task(task_or_project_id):
        if task_or_project_id == _TASK_ID:
            return _fake_task()
        return None

    monkeypatch.setattr(
        db_service, "get_generation_task", AsyncMock(side_effect=get_task)
    )
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    _mock(
        monkeypatch,
        db_service,
        "get_latest_generation_task_by_project",
        _fake_task(task_id="latest-task"),
    )

    resp = client.get(f"/api/v1/preview/{_PROJECT_ID}")
    assert resp.status_code == 200
    assert resp.json()["data"]["task_id"] == "latest-task"


def test_get_preview_not_found_404(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_generation_task", None)
    _mock(monkeypatch, db_service, "get_project", None)

    resp = client.get("/api/v1/preview/not-exist")
    assert resp.status_code == 404


def test_get_preview_forbidden_403(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_generation_task", _fake_task())
    _mock(monkeypatch, db_service, "get_project", _fake_project(user_id="other"))

    resp = client.get(f"/api/v1/preview/{_TASK_ID}")
    assert resp.status_code == 403


def test_get_preview_no_token_401(client):
    resp = client.get(f"/api/v1/preview/{_TASK_ID}")
    assert resp.status_code == 401


def test_modify_preview_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_generation_task", _fake_task())
    _mock(monkeypatch, db_service, "get_project", _fake_project())

    resp = client.post(
        f"/api/v1/preview/{_TASK_ID}/modify",
        json={"instruction": "please add one summary slide"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["modify_task_id"] == f"modify-{_TASK_ID}"


def test_modify_preview_idempotency_hit_returns_cached(client, monkeypatch, _as_user):
    cached = {
        "success": True,
        "data": {"modify_task_id": "cached-modify-task", "status": "processing"},
        "message": "cached",
    }
    _mock(monkeypatch, db_service, "get_generation_task", _fake_task())
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    _mock(monkeypatch, db_service, "get_idempotency_response", cached)
    save_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(db_service, "save_idempotency_response", save_mock)

    resp = client.post(
        f"/api/v1/preview/{_TASK_ID}/modify",
        json={"instruction": "please add one summary slide"},
        headers={"Idempotency-Key": "00000000-0000-0000-0000-000000000031"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["modify_task_id"] == "cached-modify-task"
    save_mock.assert_not_awaited()


def test_get_slide_detail_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_generation_task", _fake_task())
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    slide_id = f"{_TASK_ID}-slide-1"

    resp = client.get(f"/api/v1/preview/{_TASK_ID}/slides/{slide_id}")
    assert resp.status_code == 200
    assert resp.json()["data"]["slide"]["id"] == slide_id


def test_get_slide_detail_not_found_404(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_generation_task", _fake_task())
    _mock(monkeypatch, db_service, "get_project", _fake_project())

    resp = client.get(f"/api/v1/preview/{_TASK_ID}/slides/not-exist")
    assert resp.status_code == 404


def test_export_preview_json_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_generation_task", _fake_task())
    _mock(monkeypatch, db_service, "get_project", _fake_project())

    resp = client.post(
        f"/api/v1/preview/{_TASK_ID}/export",
        json={"format": "json", "include_sources": True},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["format"] == "json"
    assert "slides" in data["content"]


def test_export_preview_markdown_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_generation_task", _fake_task())
    _mock(monkeypatch, db_service, "get_project", _fake_project())

    resp = client.post(
        f"/api/v1/preview/{_TASK_ID}/export",
        json={"format": "markdown", "include_sources": False},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["format"] == "markdown"


def test_export_preview_html_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_generation_task", _fake_task())
    _mock(monkeypatch, db_service, "get_project", _fake_project())

    resp = client.post(
        f"/api/v1/preview/{_TASK_ID}/export",
        json={"format": "html", "include_sources": False},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["format"] == "html"


def test_export_preview_html_escapes_content(client, monkeypatch, _as_user):
    _mock(
        monkeypatch,
        db_service,
        "get_generation_task",
        _fake_task(status="<script>alert(1)</script>"),
    )
    _mock(monkeypatch, db_service, "get_project", _fake_project())

    resp = client.post(
        f"/api/v1/preview/{_TASK_ID}/export",
        json={"format": "html", "include_sources": False},
    )
    assert resp.status_code == 200
    html_content = resp.json()["data"]["content"]
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html_content
    assert "<script>alert(1)</script>" not in html_content


def test_export_preview_invalid_format_400(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_generation_task", _fake_task())
    _mock(monkeypatch, db_service, "get_project", _fake_project())

    resp = client.post(
        f"/api/v1/preview/{_TASK_ID}/export",
        json={"format": "pdf", "include_sources": True},
    )
    assert resp.status_code == 400
