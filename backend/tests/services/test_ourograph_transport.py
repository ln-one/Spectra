from __future__ import annotations

import pytest

from services.ourograph_client_support import transport
from utils.exceptions import ExternalServiceException


def test_ourograph_base_url_uses_local_override_for_host_runtime(monkeypatch) -> None:
    monkeypatch.setattr(transport, "running_inside_container", lambda: False)
    monkeypatch.setenv("OUROGRAPH_BASE_URL", "http://ourograph:8101")
    monkeypatch.setenv("OUROGRAPH_BASE_URL_LOCAL", "http://127.0.0.1:8101")

    assert transport.ourograph_base_url() == "http://127.0.0.1:8101"


def test_namespace_adds_camel_case_aliases_for_snake_case_payloads() -> None:
    payload = transport.namespace(
        {
            "project_id": "p-1",
            "current_version_id": "v-1",
            "artifact": {
                "owner_user_id": "u-1",
                "storage_path": "/tmp/a.json",
            },
        }
    )

    assert payload.project_id == "p-1"
    assert payload.projectId == "p-1"
    assert payload.current_version_id == "v-1"
    assert payload.currentVersionId == "v-1"
    assert payload.artifact.owner_user_id == "u-1"
    assert payload.artifact.ownerUserId == "u-1"
    assert payload.artifact.storage_path == "/tmp/a.json"
    assert payload.artifact.storagePath == "/tmp/a.json"


@pytest.mark.asyncio
async def test_ourograph_request_error_reports_base_url(monkeypatch) -> None:
    monkeypatch.setattr(transport, "running_inside_container", lambda: False)
    monkeypatch.setenv("OUROGRAPH_BASE_URL", "http://ourograph:8101")
    monkeypatch.setenv("OUROGRAPH_BASE_URL_LOCAL", "http://127.0.0.1:8101")

    def _boom(request, timeout):
        raise transport.urllib_error.URLError("connection refused")

    monkeypatch.setattr(transport.urllib_request, "urlopen", _boom)

    with pytest.raises(ExternalServiceException) as exc_info:
        await transport.request_json("GET", "/projects/p-001")

    assert exc_info.value.details["base_url"] == "http://127.0.0.1:8101"


@pytest.mark.asyncio
async def test_request_json_adds_top_level_camel_case_aliases(monkeypatch) -> None:
    monkeypatch.setattr(transport, "running_inside_container", lambda: False)
    monkeypatch.setenv("OUROGRAPH_BASE_URL", "http://ourograph:8101")
    monkeypatch.setenv("OUROGRAPH_BASE_URL_LOCAL", "http://127.0.0.1:8101")

    class _Response:
        def getcode(self):
            return 200

        def read(self):
            return b'{\"current_version_id\":\"v-1\",\"artifact\":{\"project_id\":\"p-1\"}}'

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(transport.urllib_request, "urlopen", lambda request, timeout: _Response())

    payload = await transport.request_json("GET", "/projects/p-001/versions")

    assert payload["current_version_id"] == "v-1"
    assert payload["currentVersionId"] == "v-1"
    assert payload["artifact"]["project_id"] == "p-1"
    assert payload["artifact"]["projectId"] == "p-1"
