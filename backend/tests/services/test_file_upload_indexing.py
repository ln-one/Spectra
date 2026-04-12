from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from services.file_upload_service import indexing as indexing_service


@pytest.mark.asyncio
async def test_index_upload_for_rag_schedules_remote_reconcile_when_parse_is_deferred(
    monkeypatch,
):
    upload = SimpleNamespace(id="file-001")
    parse_result = {
        "deferred_parse": True,
        "provider_used": "dualweave_remote",
        "dualweave": {"upload_id": "upl-123", "status": "pending_remote"},
    }
    monkeypatch.setattr(
        "services.media.rag_indexing.index_upload_file_for_rag",
        AsyncMock(return_value=parse_result),
    )
    update_status = AsyncMock()
    monkeypatch.setattr(
        indexing_service.db_service,
        "update_upload_status",
        update_status,
    )
    enqueue_remote = Mock()
    monkeypatch.setattr(
        indexing_service,
        "enqueue_remote_parse_reconcile",
        enqueue_remote,
    )

    await indexing_service.index_upload_for_rag(
        upload,
        "project-001",
        session_id="session-001",
        task_queue_service=Mock(),
    )

    update_status.assert_awaited_once()
    assert update_status.await_args.kwargs["status"] == "parsing"
    enqueue_remote.assert_called_once()


@pytest.mark.asyncio
async def test_index_upload_for_rag_local_fallback_reconciles_until_terminal(
    monkeypatch,
):
    upload = SimpleNamespace(id="file-001")
    parse_result = {
        "deferred_parse": True,
        "provider_used": "dualweave_remote",
        "dualweave": {"upload_id": "upl-123", "status": "pending_remote"},
    }
    monkeypatch.setattr(
        "services.media.rag_indexing.index_upload_file_for_rag",
        AsyncMock(return_value=parse_result),
    )
    monkeypatch.setattr(
        indexing_service.db_service,
        "update_upload_status",
        AsyncMock(),
    )
    reconcile = AsyncMock(return_value="completed")
    monkeypatch.setattr(
        indexing_service,
        "reconcile_remote_parse_until_terminal",
        reconcile,
    )

    await indexing_service.index_upload_for_rag(
        upload,
        "project-001",
        session_id="session-001",
        task_queue_service=None,
    )

    reconcile.assert_awaited_once()
