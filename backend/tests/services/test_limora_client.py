from __future__ import annotations

import pytest

from services.platform import limora_client
from utils.exceptions import ExternalServiceException


def test_limora_base_url_uses_local_override_for_host_runtime(monkeypatch) -> None:
    monkeypatch.setattr(limora_client, "running_inside_container", lambda: False)
    monkeypatch.setenv("LIMORA_BASE_URL", "http://limora:3001")
    monkeypatch.setenv("LIMORA_BASE_URL_LOCAL", "http://127.0.0.1:3001")

    assert limora_client.limora_base_url() == "http://127.0.0.1:3001"


@pytest.mark.asyncio
async def test_limora_request_timeout_reports_base_url(monkeypatch) -> None:
    monkeypatch.setattr(limora_client, "running_inside_container", lambda: False)
    monkeypatch.setenv("LIMORA_BASE_URL", "http://limora:3001")
    monkeypatch.setenv("LIMORA_BASE_URL_LOCAL", "http://127.0.0.1:3001")

    class _BoomClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def request(self, *args, **kwargs):
            raise limora_client.httpx.TimeoutException("timed out")

    monkeypatch.setattr(limora_client.httpx, "AsyncClient", lambda **kwargs: _BoomClient())

    client = limora_client.LimoraClient(base_url=limora_client.limora_base_url() or "")
    with pytest.raises(ExternalServiceException) as exc_info:
        await client.get_current_session()

    assert exc_info.value.details["base_url"] == "http://127.0.0.1:3001"
