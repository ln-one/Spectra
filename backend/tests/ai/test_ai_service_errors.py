import pytest

from services.ai import AIService
from utils.exceptions import ErrorCode, ExternalServiceException


@pytest.mark.asyncio
async def test_generate_raises_structured_auth_error_when_stub_disabled(monkeypatch):
    service = AIService()
    service.allow_ai_stub = False

    async def _boom(*args, **kwargs):
        raise Exception("invalid api key (2049)")

    monkeypatch.setattr(service, "_run_completion", _boom)

    with pytest.raises(ExternalServiceException) as exc_info:
        await service.generate("hello", route_task="chat_response")

    exc = exc_info.value
    assert exc.error_code == ErrorCode.UPSTREAM_AUTH_ERROR
    assert exc.retryable is False
    assert exc.details["failure_type"] == "auth_error"


@pytest.mark.asyncio
async def test_generate_raises_structured_timeout_error_when_stub_disabled(monkeypatch):
    service = AIService()
    service.allow_ai_stub = False

    async def _timeout(*args, **kwargs):
        raise TimeoutError("provider timed out")

    monkeypatch.setattr(service, "_run_completion", _timeout)

    with pytest.raises(ExternalServiceException) as exc_info:
        await service.generate("hello", route_task="chat_response")

    exc = exc_info.value
    assert exc.error_code == ErrorCode.UPSTREAM_TIMEOUT
    assert exc.retryable is True
    assert exc.details["failure_type"] == "timeout"


@pytest.mark.asyncio
async def test_generate_returns_stub_only_when_explicitly_enabled(monkeypatch):
    service = AIService()
    service.allow_ai_stub = True

    async def _boom(*args, **kwargs):
        raise Exception("provider unavailable")

    monkeypatch.setattr(service, "_run_completion", _boom)

    payload = await service.generate("hello", route_task="chat_response")
    assert payload["content"].startswith("AI stub response")
    assert payload["fallback_triggered"] is False
    assert payload["route"]["failure_reason"] == "completion_error"
