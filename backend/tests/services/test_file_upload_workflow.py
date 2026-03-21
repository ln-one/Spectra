from types import SimpleNamespace
from unittest.mock import AsyncMock

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
    upload = SimpleNamespace(id="file-001")
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
