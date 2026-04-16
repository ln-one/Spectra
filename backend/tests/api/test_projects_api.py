"""Projects API contract tests for C6 scope."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from main import app
from routers.projects import detail as project_detail_router
from services.application import project_api
from services.database import db_service
from utils.dependencies import get_current_user
from utils.exceptions import ConflictException, ForbiddenException, NotFoundException

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


def test_get_project_internal_error_uses_unified_error_contract(
    client, monkeypatch, _as_user
):
    monkeypatch.setattr(
        db_service,
        "get_project",
        AsyncMock(side_effect=RuntimeError("db down")),
    )

    resp = client.get(f"/api/v1/projects/{_PROJECT_ID}")
    assert resp.status_code == 500
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert body["error"]["message"] == "获取项目详情失败"
    assert body["error"]["retryable"] is False
    assert body["error"]["trace_id"]


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


def test_search_projects_internal_error_uses_unified_error_contract(
    client, monkeypatch, _as_user
):
    monkeypatch.setattr(
        db_service,
        "search_projects",
        AsyncMock(side_effect=RuntimeError("search failed")),
    )
    _mock(monkeypatch, db_service, "count_search_projects", 0)

    resp = client.get("/api/v1/projects/search?q=Project&page=1&limit=20")
    assert resp.status_code == 500
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert body["error"]["message"] == "搜索项目失败"
    assert body["error"]["retryable"] is False
    assert body["error"]["trace_id"]


def test_create_project_with_project_space_fields_success(
    client, monkeypatch, _as_user
):
    created = _fake_project(
        visibility="shared", isReferenceable=True, currentVersionId="v-1"
    )
    _mock(monkeypatch, db_service, "create_project", created)
    monkeypatch.setattr(
        project_api,
        "_create_formal_project",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        project_api,
        "_create_base_reference_if_needed",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        project_api,
        "_bootstrap_default_session",
        AsyncMock(return_value=None),
    )

    resp = client.post(
        "/api/v1/projects",
        json={
            "name": "Project With Base",
            "description": "desc",
            "base_project_id": "base-001",
            "reference_mode": "follow",
            "visibility": "shared",
            "is_referenceable": True,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["project"]["visibility"] == "shared"
    assert body["data"]["project"]["isReferenceable"] is True


def test_create_project_bootstraps_default_session(client, monkeypatch, _as_user):
    created = _fake_project()
    _mock(monkeypatch, db_service, "create_project", created)
    monkeypatch.setattr(
        project_api,
        "_create_formal_project",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        project_api,
        "_create_base_reference_if_needed",
        AsyncMock(return_value=None),
    )
    bootstrap_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(project_api, "_bootstrap_default_session", bootstrap_mock)

    resp = client.post(
        "/api/v1/projects",
        json={"name": "Project A", "description": "desc"},
    )

    assert resp.status_code == 200
    bootstrap_mock.assert_awaited_once_with(_PROJECT_ID, _USER_ID)


def test_create_project_rejects_invalid_reference_mode(client, _as_user):
    resp = client.post(
        "/api/v1/projects",
        json={
            "name": "Project With Base",
            "description": "desc",
            "base_project_id": "base-001",
            "reference_mode": "snapshot",
        },
    )

    assert resp.status_code == 400


def test_update_project_rejects_invalid_visibility(client, _as_user):
    resp = client.put(
        f"/api/v1/projects/{_PROJECT_ID}",
        json={
            "name": "Updated",
            "description": "new desc",
            "visibility": "public",
        },
    )

    assert resp.status_code == 400


def test_create_project_rejects_private_referenceable_combo(client, _as_user):
    resp = client.post(
        "/api/v1/projects",
        json={
            "name": "Private Ref",
            "description": "desc",
            "visibility": "private",
            "is_referenceable": True,
        },
    )

    assert resp.status_code == 400


def test_update_project_rejects_private_referenceable_combo(client, _as_user):
    resp = client.put(
        f"/api/v1/projects/{_PROJECT_ID}",
        json={
            "name": "Updated",
            "description": "new desc",
            "visibility": "private",
            "is_referenceable": True,
        },
    )

    assert resp.status_code == 400


def test_update_project_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    _mock(monkeypatch, db_service, "get_idempotency_response", None)
    _mock(monkeypatch, db_service, "update_project", _fake_project(name="Updated"))
    save_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(db_service, "save_idempotency_response", save_mock)
    monkeypatch.setattr(
        project_api.project_space_service,
        "update_project_governance",
        AsyncMock(return_value=None),
    )

    resp = client.put(
        f"/api/v1/projects/{_PROJECT_ID}",
        json={"name": "Updated", "description": "new desc", "grade_level": "G10"},
        headers={"Idempotency-Key": "00000000-0000-0000-0000-000000000111"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["project"]["name"] == "Updated"
    save_mock.assert_awaited_once()


def test_update_project_project_space_fields_passed(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    _mock(monkeypatch, db_service, "get_idempotency_response", None)
    update_mock = AsyncMock(
        return_value=_fake_project(name="Updated", visibility="private")
    )
    monkeypatch.setattr(db_service, "update_project", update_mock)
    monkeypatch.setattr(
        db_service, "save_idempotency_response", AsyncMock(return_value=None)
    )
    governance_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(
        project_api.project_space_service,
        "update_project_governance",
        governance_mock,
    )

    resp = client.put(
        f"/api/v1/projects/{_PROJECT_ID}",
        json={
            "name": "Updated",
            "description": "new desc",
            "visibility": "private",
            "is_referenceable": False,
        },
    )

    assert resp.status_code == 200
    update_mock.assert_awaited_once_with(
        project_id=_PROJECT_ID,
        name="Updated",
        description="new desc",
        grade_level=None,
        visibility="private",
        is_referenceable=False,
    )
    governance_mock.assert_awaited_once_with(
        project_id=_PROJECT_ID,
        user_id=_USER_ID,
        description="new desc",
        visibility="private",
        is_referenceable=False,
    )


def test_update_project_idempotency_hit_returns_cached(client, monkeypatch, _as_user):
    cached = {
        "success": True,
        "data": {"project": {"id": _PROJECT_ID, "name": "Cached"}},
        "message": "cached",
    }
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    _mock(monkeypatch, db_service, "get_idempotency_response", cached)
    update_mock = AsyncMock(return_value=_fake_project(name="Updated"))
    monkeypatch.setattr(db_service, "update_project", update_mock)

    resp = client.put(
        f"/api/v1/projects/{_PROJECT_ID}",
        json={"name": "Updated", "description": "new desc"},
        headers={"Idempotency-Key": "00000000-0000-0000-0000-000000000112"},
    )

    assert resp.status_code == 200
    assert resp.json()["data"]["project"]["name"] == "Cached"
    update_mock.assert_not_awaited()


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
    delete_response = {"success": True, "message": "项目删除成功", "data": {}}
    monkeypatch.setattr(
        project_detail_router,
        "delete_project_response",
        AsyncMock(return_value=delete_response),
    )

    resp = client.delete(f"/api/v1/projects/{_PROJECT_ID}")
    assert resp.status_code == 200
    assert resp.json()["success"] is True


def test_delete_project_not_found_404(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        project_detail_router,
        "delete_project_response",
        AsyncMock(side_effect=NotFoundException()),
    )

    resp = client.delete(f"/api/v1/projects/{_PROJECT_ID}")
    assert resp.status_code == 404


def test_delete_project_forbidden_403(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        project_detail_router,
        "delete_project_response",
        AsyncMock(side_effect=ForbiddenException()),
    )

    resp = client.delete(f"/api/v1/projects/{_PROJECT_ID}")
    assert resp.status_code == 403


def test_delete_project_formal_delete_failure_does_not_mask_error(
    client, monkeypatch, _as_user
):
    monkeypatch.setattr(
        project_detail_router,
        "delete_project_response",
        AsyncMock(side_effect=ConflictException(message="formal conflict")),
    )

    resp = client.delete(f"/api/v1/projects/{_PROJECT_ID}")
    assert resp.status_code == 409


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
