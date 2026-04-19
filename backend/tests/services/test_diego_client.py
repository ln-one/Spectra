from __future__ import annotations

import pytest

from services import diego_client
from utils.exceptions import ExternalServiceException


def test_diego_base_url_uses_local_override_for_host_runtime(monkeypatch) -> None:
    monkeypatch.setattr(diego_client, "running_inside_container", lambda: False)
    monkeypatch.setenv("DIEGO_BASE_URL", "http://diego:8000")
    monkeypatch.setenv("DIEGO_BASE_URL_LOCAL", "http://127.0.0.1:8000")

    assert diego_client.diego_base_url() == "http://127.0.0.1:8000"


@pytest.mark.asyncio
async def test_diego_request_timeout_reports_base_url(monkeypatch) -> None:
    monkeypatch.setattr(diego_client, "running_inside_container", lambda: False)
    monkeypatch.setenv("DIEGO_BASE_URL", "http://diego:8000")
    monkeypatch.setenv("DIEGO_BASE_URL_LOCAL", "http://127.0.0.1:8000")

    class _BoomClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def request(self, *args, **kwargs):
            raise diego_client.httpx.TimeoutException("timed out")

    monkeypatch.setattr(diego_client.httpx, "AsyncClient", lambda **kwargs: _BoomClient())

    client = diego_client.DiegoClient(base_url=diego_client.diego_base_url())
    with pytest.raises(ExternalServiceException) as exc_info:
        await client.get_run("run-001")

    assert exc_info.value.details["base_url"] == "http://127.0.0.1:8000"
