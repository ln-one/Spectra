from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.file_upload_service import remote_parse

_GENERIC_IMAGE_EXECUTION = {
    "send": {"kind": "send/http_multipart"},
    "workflow": {"kind": "workflow/immediate"},
    "result": {"kind": "result/inline_json"},
    "auth": {"kind": "auth/header_token"},
}


class _FakeDualweaveClient:
    timeout_seconds = 5.0

    def __init__(self, result):
        self.result = result
        self.replay_calls: list[str] = []
        self.upload_calls: list[dict[str, object]] = []

    def upload_file_sync(
        self,
        *,
        filepath: str,
        filename: str,
        execution: dict | None = None,
        mime_type: str | None = None,
    ):
        self.upload_calls.append(
            {
                "filepath": filepath,
                "filename": filename,
                "mime_type": mime_type,
                "execution": execution,
            }
        )
        return self.result

    def get_upload_sync(self, upload_id: str):
        return self.result

    def trigger_replay_sync(self, upload_id: str):
        self.replay_calls.append(upload_id)
        return self.result


@pytest.mark.asyncio
async def test_reconcile_remote_parse_once_applies_ready_result(monkeypatch):
    db = SimpleNamespace(
        get_file=AsyncMock(
            return_value=SimpleNamespace(
                id="file-001",
                projectId="project-001",
                fileType="pdf",
                parseResult={
                    "deferred_parse": True,
                    "dualweave": {"upload_id": "upl-123"},
                },
            )
        ),
        update_upload_status=AsyncMock(),
    )
    monkeypatch.setattr(
        remote_parse,
        "build_dualweave_client",
        lambda **kwargs: _FakeDualweaveClient(
            {
                "upload_id": "upl-123",
                "status": "completed",
                "processing_artifact": {
                    "result_url": "https://example.invalid/result.zip"
                },
            }
        ),
    )
    monkeypatch.setattr(
        remote_parse,
        "build_dualweave_execution",
        lambda file_type: dict(_GENERIC_IMAGE_EXECUTION),
    )
    monkeypatch.setattr(
        remote_parse,
        "_download_markdown_from_result_url",
        lambda result_url, timeout_seconds: "remote text",
    )
    apply_result = AsyncMock(return_value={"indexed_count": 1})
    monkeypatch.setattr(
        remote_parse,
        "apply_dualweave_parse_result_internal",
        apply_result,
    )

    outcome = await remote_parse.reconcile_remote_parse_once(
        db=db,
        file_id="file-001",
        session_id="session-001",
    )

    assert outcome == "completed"
    apply_result.assert_awaited_once()
    db.update_upload_status.assert_not_called()


@pytest.mark.asyncio
async def test_reconcile_remote_parse_once_updates_pending_status(monkeypatch):
    db = SimpleNamespace(
        get_file=AsyncMock(
            return_value=SimpleNamespace(
                id="file-001",
                projectId="project-001",
                fileType="pdf",
                parseResult={
                    "deferred_parse": True,
                    "dualweave": {"upload_id": "upl-123"},
                },
            )
        ),
        update_upload_status=AsyncMock(),
    )
    monkeypatch.setattr(
        remote_parse,
        "build_dualweave_client",
        lambda **kwargs: _FakeDualweaveClient(
            {
                "upload_id": "upl-123",
                "status": "pending_remote",
                "remote_next_action": "retry_remote_later",
            }
        ),
    )
    monkeypatch.setattr(
        remote_parse,
        "build_dualweave_execution",
        lambda file_type: dict(_GENERIC_IMAGE_EXECUTION),
    )

    outcome = await remote_parse.reconcile_remote_parse_once(
        db=db,
        file_id="file-001",
        session_id="session-001",
    )

    assert outcome == "pending"
    db.update_upload_status.assert_awaited_once()
    assert db.update_upload_status.await_args.kwargs["status"] == "parsing"


@pytest.mark.asyncio
async def test_reconcile_remote_parse_once_triggers_fallback_on_terminal_result(
    monkeypatch,
):
    db = SimpleNamespace(
        get_file=AsyncMock(
            return_value=SimpleNamespace(
                id="file-001",
                projectId="project-001",
                fileType="pdf",
                parseResult={
                    "deferred_parse": True,
                    "dualweave": {"upload_id": "upl-123"},
                },
            )
        ),
        update_upload_status=AsyncMock(),
    )
    monkeypatch.setattr(
        remote_parse,
        "build_dualweave_client",
        lambda **kwargs: _FakeDualweaveClient(
            {
                "upload_id": "upl-123",
                "status": "failed",
            }
        ),
    )
    monkeypatch.setattr(
        remote_parse,
        "build_dualweave_execution",
        lambda file_type: dict(_GENERIC_IMAGE_EXECUTION),
    )
    fallback = AsyncMock(return_value={"provider": "local"})
    monkeypatch.setattr(
        remote_parse,
        "trigger_fallback_parse_internal",
        fallback,
    )

    outcome = await remote_parse.reconcile_remote_parse_once(
        db=db,
        file_id="file-001",
        session_id="session-001",
    )

    assert outcome == "fallback"
    fallback.assert_awaited_once()


@pytest.mark.asyncio
async def test_start_remote_parse_upload_marks_image_failure_without_local_placeholder(
    monkeypatch,
):
    upload = SimpleNamespace(
        id="file-001",
        projectId="project-001",
        fileType="image",
        filename="lesson.png",
        filepath="/tmp/lesson.png",
        mimeType="image/png",
    )
    db = SimpleNamespace(update_upload_status=AsyncMock())
    monkeypatch.setattr(
        remote_parse,
        "build_dualweave_client",
        lambda **kwargs: _FakeDualweaveClient(
            {
                "upload_id": "upl-123",
                "status": "failed",
                "processing_artifact": {"provider": "ocrspace"},
            }
        ),
    )
    monkeypatch.setattr(
        remote_parse,
        "build_dualweave_execution",
        lambda file_type: dict(_GENERIC_IMAGE_EXECUTION),
    )
    failure = AsyncMock(return_value={"status": "failed"})
    monkeypatch.setattr(remote_parse, "trigger_fallback_parse_internal", failure)

    outcome = await remote_parse.start_remote_parse_upload(
        db=db,
        upload=upload,
        session_id="session-001",
    )

    assert outcome == "fallback"
    failure.assert_awaited_once()


@pytest.mark.asyncio
async def test_start_remote_parse_upload_passes_execution(monkeypatch):
    upload = SimpleNamespace(
        id="file-001",
        projectId="project-001",
        fileType="pdf",
        filename="lesson.pdf",
        filepath="/tmp/lesson.pdf",
        mimeType="application/pdf",
    )
    db = SimpleNamespace(update_upload_status=AsyncMock())
    client = _FakeDualweaveClient(
        {
            "upload_id": "upl-123",
            "status": "pending_remote",
            "remote_next_action": "retry_remote_later",
        }
    )
    execution = dict(_GENERIC_IMAGE_EXECUTION)
    monkeypatch.setattr(remote_parse, "build_dualweave_client", lambda **kwargs: client)
    monkeypatch.setattr(
        remote_parse, "build_dualweave_execution", lambda file_type: execution
    )

    outcome = await remote_parse.start_remote_parse_upload(
        db=db,
        upload=upload,
        session_id="session-001",
    )

    assert outcome == "pending"
    assert client.upload_calls[0]["execution"] == execution
