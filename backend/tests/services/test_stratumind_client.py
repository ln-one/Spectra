from __future__ import annotations

import json
from urllib import error as urllib_error

import pytest

from services import stratumind_client
from services.stratumind_client import StratumindClientError
from utils.exceptions import ExternalServiceException


def test_stratumind_base_url_uses_local_override_for_host_runtime(
    monkeypatch,
) -> None:
    monkeypatch.setattr(stratumind_client, "running_inside_container", lambda: False)
    monkeypatch.setenv("STRATUMIND_BASE_URL", "http://stratumind:8110")
    monkeypatch.setenv("STRATUMIND_BASE_URL_LOCAL", "http://127.0.0.1:8110")

    assert stratumind_client.stratumind_base_url() == "http://127.0.0.1:8110"


def test_stratumind_base_url_keeps_container_address_inside_container(
    monkeypatch,
) -> None:
    monkeypatch.setattr(stratumind_client, "running_inside_container", lambda: True)
    monkeypatch.setenv("STRATUMIND_BASE_URL", "http://stratumind:8110")
    monkeypatch.delenv("STRATUMIND_BASE_URL_LOCAL", raising=False)

    assert stratumind_client.stratumind_base_url() == "http://stratumind:8110"


@pytest.mark.asyncio
async def test_stratumind_request_error_includes_resolved_base_url(
    monkeypatch,
) -> None:
    monkeypatch.setattr(stratumind_client, "running_inside_container", lambda: False)
    monkeypatch.setenv("STRATUMIND_BASE_URL", "http://stratumind:8110")
    monkeypatch.setenv("STRATUMIND_BASE_URL_LOCAL", "http://127.0.0.1:8110")

    def _boom(request, timeout):
        raise urllib_error.URLError("connection refused")

    monkeypatch.setattr(stratumind_client.urllib_request, "urlopen", _boom)

    with pytest.raises(ExternalServiceException) as exc_info:
        await stratumind_client._request("GET", "/search/text")

    assert exc_info.value.details["base_url"] == "http://127.0.0.1:8110"


@pytest.mark.asyncio
async def test_stratumind_http_error_includes_resolved_base_url(
    monkeypatch,
) -> None:
    monkeypatch.setattr(stratumind_client, "running_inside_container", lambda: False)
    monkeypatch.setenv("STRATUMIND_BASE_URL", "http://stratumind:8110")
    monkeypatch.setenv("STRATUMIND_BASE_URL_LOCAL", "http://127.0.0.1:8110")

    class _FakeHttpError(urllib_error.HTTPError):
        def __init__(self):
            super().__init__(
                url="http://127.0.0.1:8110/search/text",
                code=502,
                msg="Bad Gateway",
                hdrs=None,
                fp=None,
            )

        def read(self):
            return json.dumps(
                {
                    "error": {
                        "message": "upstream failed",
                        "code": "BAD_GATEWAY",
                        "details": {"stage": "search"},
                    }
                }
            ).encode("utf-8")

    def _raise_http_error(request, timeout):
        raise _FakeHttpError()

    monkeypatch.setattr(stratumind_client.urllib_request, "urlopen", _raise_http_error)

    with pytest.raises(StratumindClientError) as exc_info:
        await stratumind_client._request("GET", "/search/text")

    assert exc_info.value.details == {
        "stage": "search",
        "base_url": "http://127.0.0.1:8110",
    }
