from services.platform.dualweave_client import (
    DualweaveClient,
    build_dualweave_client,
    dualweave_base_url,
    dualweave_enabled,
)


def test_dualweave_client_disabled_by_default(monkeypatch):
    monkeypatch.delenv("DUALWEAVE_ENABLED", raising=False)
    monkeypatch.delenv("DUALWEAVE_BASE_URL", raising=False)

    assert dualweave_enabled() is False
    assert dualweave_base_url() is None
    assert build_dualweave_client() is None


def test_dualweave_client_builds_when_enabled(monkeypatch):
    monkeypatch.setenv("DUALWEAVE_ENABLED", "true")
    monkeypatch.setenv("DUALWEAVE_BASE_URL", "http://dualweave:8080/")
    monkeypatch.setenv("DUALWEAVE_TIMEOUT_SECONDS", "123")

    client = build_dualweave_client()

    assert client is not None
    assert client.base_url == "http://dualweave:8080"
    assert client.timeout_seconds == 123.0


def test_dualweave_client_sync_methods_strip_base_url(monkeypatch):
    monkeypatch.setenv("DUALWEAVE_ENABLED", "true")
    monkeypatch.setenv("DUALWEAVE_BASE_URL", "http://dualweave:8080/")

    client = build_dualweave_client()

    assert isinstance(client, DualweaveClient)
    assert client.base_url == "http://dualweave:8080"
