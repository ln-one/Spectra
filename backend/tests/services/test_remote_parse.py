from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.file_upload_service import remote_parse


class _FakeDualweaveClient:
    timeout_seconds = 5.0

    def __init__(self, result):
        self.result = result
        self.replay_calls: list[str] = []

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
        lambda: _FakeDualweaveClient(
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
        "_download_markdown_from_result_url",
        lambda result_url, timeout_seconds: "remote text",
    )
    apply_result = AsyncMock(return_value={"indexed_count": 1})
    monkeypatch.setattr(
        remote_parse,
        "apply_mineru_parse_result_internal",
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
        lambda: _FakeDualweaveClient(
            {
                "upload_id": "upl-123",
                "status": "pending_remote",
                "remote_next_action": "retry_remote_later",
            }
        ),
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
        lambda: _FakeDualweaveClient(
            {
                "upload_id": "upl-123",
                "status": "failed",
            }
        ),
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
