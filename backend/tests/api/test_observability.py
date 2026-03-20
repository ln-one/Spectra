"""
C11 – Observability & stability regression tests.

Covers:
- RequestIDMiddleware (request_id injection, response header, access log)
- Unified exception mapping (PrismaError → 503, ValueError → 400, etc.)
- request_id / user_id propagation in error responses
"""

import anyio
import pytest
from starlette.requests import Request
from starlette.testclient import TestClient

from main import app
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
        assert "X-Process-Time" in resp.headers
        assert resp.headers["X-Process-Time"].endswith("ms")
        # Should be a valid UUID-like string
        rid = resp.headers["X-Request-ID"]
        assert len(rid) >= 32

    def test_echoes_caller_request_id(self, client: TestClient):
        custom_rid = "my-trace-id-12345"
        resp = client.get("/health", headers={"X-Request-ID": custom_rid})
        assert resp.headers.get("X-Request-ID") == custom_rid

    def test_request_id_in_error_response(self, client: TestClient):
        """401 errors should still include request_id in details."""
        client._transport.raise_server_exceptions = False
        resp = client.get("/api/v1/projects")
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

    @staticmethod
    def _request() -> Request:
        return Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/api/v1/projects",
                "headers": [],
                "query_string": b"",
            }
        )

    def test_value_error_maps_to_400(self):
        handler = app.exception_handlers[Exception]
        response = anyio.run(handler, self._request(), ValueError("bad param"))
        assert response.status_code == 400
        assert b'"INVALID_INPUT"' in response.body

    def test_timeout_error_maps_to_502(self):
        handler = app.exception_handlers[Exception]
        response = anyio.run(handler, self._request(), TimeoutError("upstream slow"))
        assert response.status_code == 502
        assert b'"EXTERNAL_SERVICE_ERROR"' in response.body

    def test_validation_error_includes_request_id(self, client: TestClient, _as_user):
        """Pydantic validation error → 400 with request_id."""
        resp = client.post("/api/v1/generate/sessions", json={})
        assert resp.status_code == 400
        body = resp.json()
        details = body.get("error", {}).get("details", {})
        assert "request_id" in details
