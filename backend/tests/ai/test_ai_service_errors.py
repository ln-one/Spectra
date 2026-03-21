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


@pytest.mark.asyncio
async def test_generate_retries_transient_upstream_failure_before_succeeding(
    monkeypatch,
):
    service = AIService()
    service.allow_ai_stub = False
    service.upstream_retry_attempts = 1
    service.upstream_retry_delay_seconds = 0

    class _Response:
        choices = [
            type("Choice", (), {"message": type("Msg", (), {"content": "ok"})()})
        ]
        usage = type("Usage", (), {"total_tokens": 12})()

    calls = {"count": 0}

    async def _flaky(*args, **kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            raise Exception("service unavailable")
        return _Response()

    monkeypatch.setattr(service, "_run_completion", _flaky)

    payload = await service.generate("hello", route_task="chat_response")

    assert calls["count"] == 2
    assert payload["content"] == "ok"
    assert payload["route"]["retry_attempts"] == 1
    assert payload["route"]["retry_succeeded"] is True


@pytest.mark.asyncio
async def test_generate_does_not_retry_auth_errors(monkeypatch):
    service = AIService()
    service.allow_ai_stub = False
    service.upstream_retry_attempts = 2
    service.upstream_retry_delay_seconds = 0
    calls = {"count": 0}

    async def _boom(*args, **kwargs):
        calls["count"] += 1
        raise Exception("invalid api key")

    monkeypatch.setattr(service, "_run_completion", _boom)

    with pytest.raises(ExternalServiceException) as exc_info:
        await service.generate("hello", route_task="chat_response")

    assert calls["count"] == 1
    assert exc_info.value.error_code == ErrorCode.UPSTREAM_AUTH_ERROR
