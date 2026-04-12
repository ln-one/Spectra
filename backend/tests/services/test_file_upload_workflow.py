from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from services.file_upload_service.workflow import (
    _prepare_uploaded_file,
    batch_upload_files_response,
    upload_file_response,
)


@pytest.mark.asyncio
async def test_prepare_uploaded_file_refreshes_latest_status_after_sync_index(
    monkeypatch,
):
    upload = SimpleNamespace(id="file-001", fileType="word")
    failed_upload = SimpleNamespace(
        id="file-001",
        filename="lesson.pdf",
        fileType="pdf",
        mimeType="application/pdf",
        size=12,
        status="failed",
        parseResult=None,
        errorMessage="parser down",
        usageIntent=None,
        createdAt=None,
        updatedAt=None,
    )

    monkeypatch.setattr(
        "services.file_upload_service.workflow.save_and_record_upload",
        AsyncMock(return_value=upload),
    )
    update_status = AsyncMock()
    get_file = AsyncMock(return_value=failed_upload)
    monkeypatch.setattr(
        "services.file_upload_service.workflow.db_service.update_upload_status",
        update_status,
    )
    monkeypatch.setattr(
        "services.file_upload_service.workflow.db_service.get_file", get_file
    )
    monkeypatch.setattr(
        "services.file_upload_service.workflow.index_upload_for_rag",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "services.file_upload_service.workflow._SYNC_RAG_INDEXING", True
    )

    payload = await _prepare_uploaded_file(
        request=SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace())),
        background_tasks=SimpleNamespace(add_task=lambda *args, **kwargs: None),
        file=SimpleNamespace(filename="lesson.pdf"),
        project_id="p-001",
        session_id=None,
    )

    assert payload["status"] == "failed"
    assert payload["parse_error"] == "parser down"
    assert get_file.await_count == 1


@pytest.mark.asyncio
async def test_prepare_uploaded_file_starts_remote_parse_and_enqueues_reconcile(
    monkeypatch,
):
    upload = SimpleNamespace(id="file-001", fileType="pdf")
    latest = SimpleNamespace(
        id="file-001",
        filename="lesson.pdf",
        fileType="pdf",
        mimeType="application/pdf",
        size=12,
        status="uploading",
        parseResult={"deferred_parse": True},
        errorMessage=None,
        usageIntent=None,
        createdAt=None,
        updatedAt=None,
    )
    monkeypatch.setattr(
        "services.file_upload_service.workflow.save_and_record_upload",
        AsyncMock(return_value=upload),
    )
    monkeypatch.setattr(
        "services.file_upload_service.workflow.should_use_dualweave_remote_parse",
        lambda file_type: True,
    )
    start_remote = AsyncMock(return_value="pending")
    monkeypatch.setattr(
        "services.file_upload_service.workflow.start_remote_parse_upload",
        start_remote,
    )
    enqueue_remote = Mock()
    monkeypatch.setattr(
        "services.file_upload_service.workflow.enqueue_remote_parse_reconcile",
        enqueue_remote,
    )
    monkeypatch.setattr(
        "services.file_upload_service.workflow.db_service.get_file",
        AsyncMock(return_value=latest),
    )

    task_queue_service = SimpleNamespace()
    payload = await _prepare_uploaded_file(
        request=SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(task_queue_service=task_queue_service))),
        background_tasks=SimpleNamespace(add_task=lambda *args, **kwargs: None),
        file=SimpleNamespace(filename="lesson.pdf"),
        project_id="p-001",
        session_id="s-001",
    )

    assert payload["status"] == "uploading"
    start_remote.assert_awaited_once()
    enqueue_remote.assert_called_once_with(
        task_queue_service=task_queue_service,
        file_id="file-001",
        project_id="p-001",
        session_id="s-001",
    )


@pytest.mark.asyncio
async def test_prepare_uploaded_file_starts_remote_parse_in_background_without_queue(
    monkeypatch,
):
    upload = SimpleNamespace(id="file-001", fileType="image")
    latest = SimpleNamespace(
        id="file-001",
        filename="lesson.png",
        fileType="image",
        mimeType="image/png",
        size=12,
        status="uploading",
        parseResult={"deferred_parse": True},
        errorMessage=None,
        usageIntent=None,
        createdAt=None,
        updatedAt=None,
    )
    background_calls: list[tuple] = []
    monkeypatch.setattr(
        "services.file_upload_service.workflow.save_and_record_upload",
        AsyncMock(return_value=upload),
    )
    monkeypatch.setattr(
        "services.file_upload_service.workflow.should_use_dualweave_remote_parse",
        lambda file_type: True,
    )
    monkeypatch.setattr(
        "services.file_upload_service.workflow.start_remote_parse_upload",
        AsyncMock(return_value="pending"),
    )
    monkeypatch.setattr(
        "services.file_upload_service.workflow.db_service.get_file",
        AsyncMock(return_value=latest),
    )

    payload = await _prepare_uploaded_file(
        request=SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace())),
        background_tasks=SimpleNamespace(
            add_task=lambda *args, **kwargs: background_calls.append((args, kwargs))
        ),
        file=SimpleNamespace(filename="lesson.png"),
        project_id="p-001",
        session_id="s-001",
    )

    assert payload["status"] == "uploading"
    assert background_calls
    args, kwargs = background_calls[0]
    assert args[0].__name__ == "reconcile_remote_parse_until_terminal"
    assert kwargs["file_id"] == "file-001"


@pytest.mark.asyncio
async def test_upload_file_response_uses_status_aware_message(monkeypatch):
    monkeypatch.setattr(
        "services.file_upload_service.workflow.verify_project_access",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "services.file_upload_service.workflow._prepare_uploaded_file",
        AsyncMock(return_value={"id": "f-001", "status": "parsing"}),
    )

    response = await upload_file_response(
        request=SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace())),
        background_tasks=SimpleNamespace(add_task=lambda *args, **kwargs: None),
        file=SimpleNamespace(filename="lesson.pdf"),
        project_id="p-001",
        session_id=None,
        user_id="u-001",
    )

    assert response["message"] == "文件上传成功，正在解析中"


@pytest.mark.asyncio
async def test_upload_file_response_deferred_result_uses_waiting_message(monkeypatch):
    monkeypatch.setattr(
        "services.file_upload_service.workflow.verify_project_access",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "services.file_upload_service.workflow._prepare_uploaded_file",
        AsyncMock(
            return_value={
                "id": "f-001",
                "status": "parsing",
                "parse_result": {"deferred_parse": True},
            }
        ),
    )

    response = await upload_file_response(
        request=SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace())),
        background_tasks=SimpleNamespace(add_task=lambda *args, **kwargs: None),
        file=SimpleNamespace(filename="lesson.pdf"),
        project_id="p-001",
        session_id=None,
        user_id="u-001",
    )

    assert response["message"] == "文件上传成功，等待远端解析结果"


@pytest.mark.asyncio
async def test_batch_upload_response_reports_partial_failure(monkeypatch):
    monkeypatch.setattr(
        "services.file_upload_service.workflow.verify_project_access",
        AsyncMock(return_value=None),
    )

    async def prepare(**kwargs):
        file = kwargs["file"]
        if file.filename == "broken.pdf":
            raise ValueError("parser down")
        return {"id": "f-ok", "status": "ready"}

    monkeypatch.setattr(
        "services.file_upload_service.workflow._prepare_uploaded_file", prepare
    )

    response = await batch_upload_files_response(
        request=SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace())),
        background_tasks=SimpleNamespace(add_task=lambda *args, **kwargs: None),
        files=[
            SimpleNamespace(filename="ok.pdf"),
            SimpleNamespace(filename="broken.pdf"),
        ],
        project_id="p-001",
        session_id=None,
        user_id="u-001",
    )

    assert response["message"] == "批量上传完成，部分文件失败"
    assert response["data"]["total"] == 1
    assert response["data"]["failed"][0]["filename"] == "broken.pdf"


@pytest.mark.asyncio
async def test_upload_file_response_idempotency_hit_skips_prepare(monkeypatch):
    verify_access = AsyncMock(return_value=None)
    monkeypatch.setattr(
        "services.file_upload_service.workflow.verify_project_access",
        verify_access,
    )
    get_idempotency = AsyncMock(
        return_value={
            "success": True,
            "data": {"file": {"id": "f-cached"}},
            "message": "文件上传成功",
        }
    )
    monkeypatch.setattr(
        "services.file_upload_service.workflow.db_service.get_idempotency_response",
        get_idempotency,
    )
    prepare = AsyncMock(side_effect=AssertionError("prepare should not be called"))
    monkeypatch.setattr(
        "services.file_upload_service.workflow._prepare_uploaded_file", prepare
    )

    response = await upload_file_response(
        request=SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace())),
        background_tasks=SimpleNamespace(add_task=lambda *args, **kwargs: None),
        file=SimpleNamespace(filename="lesson.pdf"),
        project_id="p-001",
        session_id="s-001",
        user_id="u-001",
        idempotency_key="idem-001",
    )

    assert response["data"]["file"]["id"] == "f-cached"
    verify_access.assert_awaited_once_with("p-001", "u-001")
    get_idempotency.assert_awaited_once_with("files:single:u-001:p-001:s-001:idem-001")
    prepare.assert_not_awaited()
