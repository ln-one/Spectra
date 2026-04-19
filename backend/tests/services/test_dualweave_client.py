from services.platform.dualweave_client import (
    DualweaveClient,
    build_dualweave_client,
    dualweave_base_url,
    dualweave_enabled,
    dualweave_poll_interval_seconds,
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
    monkeypatch.setenv("DUALWEAVE_BASE_URL_LOCAL", "http://127.0.0.1:8080")
    monkeypatch.setenv("DUALWEAVE_TIMEOUT_SECONDS", "123")
    monkeypatch.setattr(
        "services.platform.dualweave_client.running_inside_container", lambda: False
    )

    client = build_dualweave_client()

    assert client is not None
    assert client.base_url == "http://127.0.0.1:8080"
    assert client.timeout_seconds == 123.0
    assert client.poll_interval_seconds == 2.0


def test_dualweave_client_sync_methods_strip_base_url(monkeypatch):
    monkeypatch.setenv("DUALWEAVE_ENABLED", "true")
    monkeypatch.setenv("DUALWEAVE_BASE_URL", "http://dualweave:8080/")
    monkeypatch.setattr(
        "services.platform.dualweave_client.running_inside_container", lambda: True
    )

    client = build_dualweave_client()

    assert isinstance(client, DualweaveClient)
    assert client.base_url == "http://dualweave:8080"


def test_dualweave_client_builds_poll_interval_when_configured(monkeypatch):
    monkeypatch.setenv("DUALWEAVE_ENABLED", "true")
    monkeypatch.setenv("DUALWEAVE_BASE_URL", "http://dualweave:8080/")
    monkeypatch.setenv("DUALWEAVE_POLL_INTERVAL_SECONDS", "0.5")

    client = build_dualweave_client()

    assert client is not None
    assert client.poll_interval_seconds == 0.5
    assert dualweave_poll_interval_seconds() == 0.5


def test_upload_file_sync_sends_execution(monkeypatch, tmp_path):
    sent: dict[str, object] = {}

    class _FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"upload_id": "upl-123"}

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, files=None, data=None):
            sent["url"] = url
            sent["files"] = files
            sent["data"] = data
            return _FakeResponse()

    monkeypatch.setattr("services.platform.dualweave_client.httpx.Client", _FakeClient)

    path = tmp_path / "sample.pdf"
    path.write_bytes(b"pdf")
    client = DualweaveClient(base_url="http://dualweave:8080")

    result = client.upload_file_sync(
        filepath=str(path),
        filename="sample.pdf",
        mime_type="application/pdf",
        execution={"send": {"kind": "send/http_multipart"}},
    )

    assert result["upload_id"] == "upl-123"
    assert sent["url"] == "http://dualweave:8080/uploads"
    assert sent["data"] == {"execution": '{"send": {"kind": "send/http_multipart"}}'}


def test_wait_for_result_url_sync_returns_immediately_when_result_ready():
    client = DualweaveClient(
        base_url="http://dualweave:8080", timeout_seconds=1, poll_interval_seconds=0.01
    )

    result = client.wait_for_result_url_sync(
        {
            "upload_id": "upl-123",
            "processing_artifact": {"result_url": "https://example.invalid/result.zip"},
        }
    )

    assert (
        result["processing_artifact"]["result_url"]
        == "https://example.invalid/result.zip"
    )


def test_wait_for_result_url_sync_triggers_replay_and_polls(monkeypatch):
    client = DualweaveClient(
        base_url="http://dualweave:8080", timeout_seconds=1, poll_interval_seconds=0.01
    )
    calls: list[str] = []

    monkeypatch.setattr(
        client,
        "trigger_replay_sync",
        lambda upload_id: calls.append(f"replay:{upload_id}")
        or {
            "upload_id": upload_id,
            "status": "pending_remote",
            "replay_status": "in_progress",
        },
    )
    monkeypatch.setattr(
        client,
        "get_upload_sync",
        lambda upload_id: calls.append(f"get:{upload_id}")
        or {
            "upload_id": upload_id,
            "status": "completed",
            "processing_artifact": {"result_url": "https://example.invalid/result.zip"},
        },
    )

    result = client.wait_for_result_url_sync(
        {
            "upload_id": "upl-123",
            "status": "pending_remote",
            "remote_next_action": "retry_remote_later",
            "replay_eligible": True,
        }
    )

    assert calls == ["replay:upl-123", "get:upl-123"]
    assert result["status"] == "completed"


def test_wait_for_result_url_sync_keeps_polling_when_replay_is_in_progress(monkeypatch):
    client = DualweaveClient(
        base_url="http://dualweave:8080", timeout_seconds=1, poll_interval_seconds=0.01
    )
    calls: list[str] = []

    monkeypatch.setattr(
        client,
        "trigger_replay_sync",
        lambda upload_id: calls.append(f"replay:{upload_id}")
        or {
            "upload_id": upload_id,
            "status": "pending_remote",
            "replay_status": "in_progress",
            "replay_eligible": False,
            "replay_blocked_reason": "replay_in_progress",
        },
    )
    monkeypatch.setattr(
        client,
        "get_upload_sync",
        lambda upload_id: calls.append(f"get:{upload_id}")
        or {
            "upload_id": upload_id,
            "status": "completed",
            "replay_status": "succeeded",
            "processing_artifact": {"result_url": "https://example.invalid/result.zip"},
        },
    )

    result = client.wait_for_result_url_sync(
        {
            "upload_id": "upl-123",
            "status": "pending_remote",
            "remote_next_action": "retry_remote_later",
            "replay_eligible": True,
        }
    )

    assert calls == ["replay:upl-123", "get:upl-123"]
    assert result["replay_status"] == "succeeded"


def test_wait_for_result_url_sync_stops_on_terminal_failure(monkeypatch):
    client = DualweaveClient(
        base_url="http://dualweave:8080", timeout_seconds=1, poll_interval_seconds=0.01
    )
    get_calls: list[str] = []

    monkeypatch.setattr(
        client,
        "get_upload_sync",
        lambda upload_id: get_calls.append(upload_id)
        or {"upload_id": upload_id, "status": "failed"},
    )

    result = client.wait_for_result_url_sync(
        {"upload_id": "upl-123", "status": "failed"}
    )

    assert result["status"] == "failed"
    assert get_calls == []


def test_wait_for_result_url_sync_stops_when_replay_is_blocked_terminally():
    client = DualweaveClient(
        base_url="http://dualweave:8080", timeout_seconds=1, poll_interval_seconds=0.01
    )

    result = client.wait_for_result_url_sync(
        {
            "upload_id": "upl-123",
            "status": "pending_remote",
            "replay_eligible": False,
            "replay_blocked_reason": "local_artifact_unavailable",
        }
    )

    assert result["replay_blocked_reason"] == "local_artifact_unavailable"
