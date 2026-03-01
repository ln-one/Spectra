"""
C11 – Observability & stability regression tests.

Covers:
- RequestIDMiddleware (request_id injection, response header, access log)
- Unified exception mapping (PrismaError → 503, ValueError → 400, etc.)
- request_id / user_id propagation in error responses
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from starlette.testclient import TestClient

from main import app
from services import db_service
from utils.dependencies import get_current_user

_USER_ID = "u-test"


@pytest.fixture()
def _as_user():
    app.dependency_overrides[get_current_user] = lambda: _USER_ID
    yield
    app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------
# RequestIDMiddleware
# ---------------------------------------------------------------


class TestRequestIDMiddleware:
    """Verify request_id lifecycle."""

    def test_generates_request_id_header(self, client: TestClient):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert "X-Request-ID" in resp.headers
        # Should be a valid UUID-like string
        rid = resp.headers["X-Request-ID"]
        assert len(rid) >= 32

    def test_echoes_caller_request_id(self, client: TestClient):
        custom_rid = "my-trace-id-12345"
        resp = client.get("/health", headers={"X-Request-ID": custom_rid})
        assert resp.headers.get("X-Request-ID") == custom_rid

    def test_request_id_in_error_response(self, client: TestClient):
        """401 errors should still include request_id in details."""
        with TestClient(app, raise_server_exceptions=False) as client_no_raise:
            resp = client_no_raise.get("/api/v1/projects")
        assert resp.status_code == 401
        body = resp.json()
        assert body["success"] is False
        # The error details should contain a request_id
        details = body.get("error", {}).get("details", {})
        assert "request_id" in details


# ---------------------------------------------------------------
# Unified exception mapping
# ---------------------------------------------------------------


class TestExceptionMapping:
    """Ensure known exceptions map to correct HTTP codes."""

    def test_value_error_maps_to_400(self, client: TestClient, monkeypatch, _as_user):
        """ValueError in a route → 400."""

        async def _explode(*a, **kw):
            raise ValueError("bad param")

        monkeypatch.setattr(db_service, "get_projects_by_user", _explode)
        monkeypatch.setattr(
            db_service, "count_projects_by_user", AsyncMock(return_value=0)
        )

        with TestClient(app, raise_server_exceptions=False) as client_no_raise:
            resp = client_no_raise.get("/api/v1/projects")
        assert resp.status_code == 400
        body = resp.json()
        assert body["error"]["code"] == "INVALID_INPUT"

    def test_timeout_error_maps_to_502(self, client: TestClient, monkeypatch, _as_user):
        """TimeoutError → 502."""

        async def _timeout(*a, **kw):
            raise TimeoutError("upstream slow")

        monkeypatch.setattr(db_service, "get_projects_by_user", _timeout)
        monkeypatch.setattr(
            db_service, "count_projects_by_user", AsyncMock(return_value=0)
        )

        with TestClient(app, raise_server_exceptions=False) as client_no_raise:
            resp = client_no_raise.get("/api/v1/projects")
        assert resp.status_code == 502
        assert resp.json()["error"]["code"] == "EXTERNAL_SERVICE_ERROR"

    def test_validation_error_includes_request_id(self, client: TestClient, _as_user):
        """Pydantic validation error → 400 with request_id."""
        # Send invalid body to generate endpoint (missing required field)
        resp = client.post("/api/v1/generate/courseware", json={})
        assert resp.status_code == 400
        body = resp.json()
        assert body["error"]["code"] == "VALIDATION_ERROR"
        details = body["error"].get("details", {})
        assert "request_id" in details


# ---------------------------------------------------------------
# Download route – improved error path
# ---------------------------------------------------------------


class TestDownloadErrorPaths:
    """Download route should use consistent APIException hierarchy."""

    @pytest.fixture(autouse=True)
    def _setup(self):
        app.dependency_overrides[get_current_user] = lambda: _USER_ID
        yield
        app.dependency_overrides.pop(get_current_user, None)

    def _mock(self, mp, task=None, project=None):
        mp.setattr(
            db_service, "get_generation_task", AsyncMock(return_value=task)
        )
        mp.setattr(db_service, "get_project", AsyncMock(return_value=project))

    def test_task_not_completed_returns_400(self, client, monkeypatch):
        task = SimpleNamespace(
            id="t1", projectId="p1", status="processing"
        )
        project = SimpleNamespace(id="p1", userId=_USER_ID, name="P")
        self._mock(monkeypatch, task=task, project=project)

        resp = client.get("/api/v1/generate/tasks/t1/download?file_type=ppt")
        assert resp.status_code == 400
        body = resp.json()
        assert body["success"] is False
        assert "VALIDATION_ERROR" in body["error"]["code"]

    def test_task_not_found_returns_404(self, client, monkeypatch):
        self._mock(monkeypatch, task=None)

        resp = client.get("/api/v1/generate/tasks/t1/download?file_type=ppt")
        assert resp.status_code == 404

    def test_forbidden_returns_403(self, client, monkeypatch):
        task = SimpleNamespace(id="t1", projectId="p1", status="completed")
        project = SimpleNamespace(id="p1", userId="other-user", name="P")
        self._mock(monkeypatch, task=task, project=project)

        resp = client.get("/api/v1/generate/tasks/t1/download?file_type=ppt")
        assert resp.status_code == 403
