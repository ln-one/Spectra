"""
C12 – Contract regression: validate every member-C endpoint returns the
standard ``{success, data|error, message}`` envelope and correct status codes.

This file consolidates the "golden path + error path" contract assertions
for **projects / files** routers so that a single
``pytest tests/test_contract_regression.py`` run proves C-scope API surface
stability.
"""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import routers.files as files_router
from main import app
from services.application import project_api
from services.database import db_service
from services.file import file_service
from utils.dependencies import get_current_user

_NOW = datetime.now(timezone.utc)
_USER_ID = "u-c12"
_PROJECT_ID = "p-c12"
_FILE_ID = "f-c12"


# ---------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------


@pytest.fixture()
def auth():
    app.dependency_overrides[get_current_user] = lambda: _USER_ID
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _proj(user_id=_USER_ID, **kw):
    d = dict(
        id=_PROJECT_ID,
        userId=user_id,
        name="Regression",
        description="d",
        createdAt=_NOW,
        updatedAt=_NOW,
    )
    d.update(kw)
    return SimpleNamespace(**d)


def _upload(**kw):
    d = dict(
        id=_FILE_ID,
        projectId=_PROJECT_ID,
        filename="a.pdf",
        filepath="uploads/a.pdf",
        fileType="pdf",
        size=3,
        status="ready",
        createdAt=_NOW,
        updatedAt=_NOW,
    )
    d.update(kw)
    return SimpleNamespace(**d)


def _m(mp, obj, attr, rv=None):
    mp.setattr(obj, attr, AsyncMock(return_value=rv))


def _assert_envelope(resp, expected_status: int, success: bool):
    """Assert standard envelope shape."""
    assert (
        resp.status_code == expected_status
    ), f"expected {expected_status} got {resp.status_code}: {resp.text[:300]}"
    body = resp.json()
    assert "success" in body
    assert body["success"] is success
    if success:
        assert "data" in body
    else:
        assert "error" in body
        assert "code" in body["error"]
    return body


# ---------------------------------------------------------------
# Projects contract
# ---------------------------------------------------------------


class TestProjectsContract:
    def test_list_200(self, client, monkeypatch, auth):
        _m(monkeypatch, db_service, "get_projects_by_user", [_proj()])
        _m(monkeypatch, db_service, "count_projects_by_user", 1)
        body = _assert_envelope(client.get("/api/v1/projects"), 200, True)
        assert "projects" in body["data"]

    def test_list_401(self, client):
        _assert_envelope(client.get("/api/v1/projects"), 401, False)

    def test_create_200(self, client, monkeypatch, auth):
        _m(monkeypatch, db_service, "get_idempotency_response", None)
        _m(monkeypatch, db_service, "create_project", _proj())
        _m(monkeypatch, db_service, "save_idempotency_response", None)
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
        body = _assert_envelope(
            client.post("/api/v1/projects", json={"name": "X", "description": "d"}),
            200,
            True,
        )
        assert "project" in body["data"]

    def test_get_200(self, client, monkeypatch, auth):
        _m(monkeypatch, db_service, "get_project", _proj())
        _assert_envelope(client.get(f"/api/v1/projects/{_PROJECT_ID}"), 200, True)

    def test_get_404(self, client, monkeypatch, auth):
        _m(monkeypatch, db_service, "get_project", None)
        _assert_envelope(client.get(f"/api/v1/projects/{_PROJECT_ID}"), 404, False)

    def test_get_403(self, client, monkeypatch, auth):
        _m(monkeypatch, db_service, "get_project", _proj(user_id="other"))
        _assert_envelope(client.get(f"/api/v1/projects/{_PROJECT_ID}"), 403, False)

    def test_update_200(self, client, monkeypatch, auth):
        _m(monkeypatch, db_service, "get_project", _proj())
        _m(monkeypatch, db_service, "get_idempotency_response", None)
        _m(monkeypatch, db_service, "update_project", _proj(name="UPD"))
        _m(monkeypatch, db_service, "save_idempotency_response", None)
        _assert_envelope(
            client.put(
                f"/api/v1/projects/{_PROJECT_ID}",
                json={"name": "UPD", "description": "d2"},
            ),
            200,
            True,
        )

    def test_delete_200(self, client, monkeypatch, auth):
        _m(monkeypatch, db_service, "get_project", _proj())
        _m(monkeypatch, db_service, "delete_project", None)
        _assert_envelope(client.delete(f"/api/v1/projects/{_PROJECT_ID}"), 200, True)

    def test_search_200(self, client, monkeypatch, auth):
        _m(monkeypatch, db_service, "search_projects", [_proj()])
        _m(monkeypatch, db_service, "count_search_projects", 1)
        _assert_envelope(client.get("/api/v1/projects/search?q=Reg"), 200, True)

    def test_statistics_200(self, client, monkeypatch, auth):
        _m(monkeypatch, db_service, "get_project", _proj())
        _m(
            monkeypatch,
            db_service,
            "get_project_statistics",
            {
                "project_id": _PROJECT_ID,
                "files_count": 3,
                "messages_count": 1,
                "generation_tasks_count": 2,
                "completed_tasks_count": 1,
                "total_file_size": 1024,
                "last_activity": _NOW,
                "created_at": _NOW,
            },
        )
        _assert_envelope(
            client.get(f"/api/v1/projects/{_PROJECT_ID}/statistics"), 200, True
        )


# ---------------------------------------------------------------
# Files contract
# ---------------------------------------------------------------


class TestFilesContract:
    @pytest.fixture(autouse=True)
    def _no_cleanup(self, monkeypatch):
        monkeypatch.setattr(files_router, "cleanup_file", lambda _: None)

    def test_upload_200(self, client, monkeypatch, auth):
        _m(monkeypatch, db_service, "get_project", _proj())
        _m(monkeypatch, file_service, "save_file", ("uploads/a.pdf", 3))
        _m(monkeypatch, db_service, "create_upload", _upload())
        _m(monkeypatch, db_service, "update_upload_status", _upload())
        _m(monkeypatch, db_service, "get_file", _upload())
        body = _assert_envelope(
            client.post(
                "/api/v1/files",
                files={"file": ("a.pdf", b"%PDF", "application/pdf")},
                data={"project_id": _PROJECT_ID},
            ),
            200,
            True,
        )
        assert "file" in body["data"]

    def test_upload_404_project(self, client, monkeypatch, auth):
        _m(monkeypatch, db_service, "get_project", None)
        _assert_envelope(
            client.post(
                "/api/v1/files",
                files={"file": ("a.pdf", b"%PDF", "application/pdf")},
                data={"project_id": _PROJECT_ID},
            ),
            404,
            False,
        )

    def test_delete_single_200(self, client, monkeypatch, auth):
        _m(monkeypatch, db_service, "get_file", _upload())
        _m(monkeypatch, db_service, "get_project", _proj())
        _m(monkeypatch, db_service, "delete_file", True)
        _assert_envelope(client.delete(f"/api/v1/files/{_FILE_ID}"), 200, True)

    def test_delete_single_404(self, client, monkeypatch, auth):
        _m(monkeypatch, db_service, "get_file", None)
        _assert_envelope(client.delete(f"/api/v1/files/{_FILE_ID}"), 404, False)

    def test_batch_delete_200(self, client, monkeypatch, auth):
        _m(monkeypatch, db_service, "get_file", _upload())
        _m(monkeypatch, db_service, "get_project", _proj())
        _m(monkeypatch, db_service, "delete_file", True)
        _assert_envelope(
            client.request(
                "DELETE", "/api/v1/files/batch", json={"file_ids": [_FILE_ID]}
            ),
            200,
            True,
        )

    def test_upload_401(self, client):
        _assert_envelope(
            client.post(
                "/api/v1/files",
                files={"file": ("a.pdf", b"%PDF", "application/pdf")},
                data={"project_id": _PROJECT_ID},
            ),
            401,
            False,
        )


# ---------------------------------------------------------------
# Health & root – always available
# ---------------------------------------------------------------


class TestHealthEndpoints:
    def test_root_200(self, client):
        resp = client.get("/")
        assert resp.status_code == 200

    def test_health_200(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"
