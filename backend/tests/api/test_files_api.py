"""Files API contract tests for C7/C8 scope."""

import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import routers.files as files_router
from main import app
from services.database import db_service
from services.file import file_service
from utils.dependencies import get_current_user

_NOW = datetime.now(timezone.utc)
_USER_ID = "u-001"
_PROJECT_ID = "p-001"
_FILE_ID = "f-001"


@pytest.fixture()
def _as_user():
    app.dependency_overrides[get_current_user] = lambda: _USER_ID
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _fake_project(user_id=_USER_ID):
    return SimpleNamespace(id=_PROJECT_ID, userId=user_id, name="P")


def _fake_upload(file_id=_FILE_ID, project_id=_PROJECT_ID, **kw):
    data = dict(
        id=file_id,
        projectId=project_id,
        filename="a.pdf",
        filepath="uploads/a.pdf",
        fileType="pdf",
        mimeType="application/pdf",
        size=3,
        status="parsing",
        parseResult=json.dumps(
            {"chunk_count": 1, "indexed_count": 1, "text_length": 12}
        ),
        errorMessage=None,
        usageIntent=None,
        createdAt=_NOW,
        updatedAt=_NOW,
    )
    data.update(kw)
    return SimpleNamespace(**data)


def _mock(mp, obj, attr, rv=None):
    mp.setattr(obj, attr, AsyncMock(return_value=rv))


@pytest.fixture(autouse=True)
def _patch_cleanup(monkeypatch):
    monkeypatch.setattr(files_router, "cleanup_file", lambda _path: None)


def test_upload_file_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    get_idempotency = AsyncMock(return_value=None)
    save_idempotency = AsyncMock(return_value=None)
    monkeypatch.setattr(db_service, "get_idempotency_response", get_idempotency)
    monkeypatch.setattr(db_service, "save_idempotency_response", save_idempotency)
    _mock(monkeypatch, file_service, "save_file", ("uploads/a.pdf", 3))
    _mock(monkeypatch, db_service, "create_upload", _fake_upload())
    _mock(monkeypatch, db_service, "update_upload_status", _fake_upload())
    _mock(monkeypatch, db_service, "get_file", _fake_upload())

    resp = client.post(
        "/api/v1/files",
        files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")},
        data={"project_id": _PROJECT_ID},
        headers={"Idempotency-Key": "00000000-0000-0000-0000-000000000011"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    file_payload = body["data"]["file"]
    assert file_payload["id"] == _FILE_ID
    assert file_payload["file_type"] == "pdf"
    assert file_payload["file_size"] == 3
    assert file_payload["parse_result"]["chunk_count"] == 1
    assert file_payload["parse_result"]["indexed_count"] == 1
    assert file_payload["parse_result"]["text_length"] == 12
    assert file_payload["parse_details"]["text_length"] == 12
    assert "fileType" not in file_payload
    assert "parseResult" not in file_payload
    get_idempotency.assert_awaited_once_with(
        "files:single:u-001:p-001:-:00000000-0000-0000-0000-000000000011"
    )
    save_idempotency.assert_awaited_once()


def test_upload_file_defer_parse_flag(client, monkeypatch, _as_user):
    mocked_response = {
        "success": True,
        "data": {"file": {"id": _FILE_ID, "status": "uploading"}},
        "message": "文件上传成功，等待远端解析结果",
    }
    upload_mock = AsyncMock(return_value=mocked_response)
    monkeypatch.setattr("routers.files.uploads.upload_file_response", upload_mock)

    resp = client.post(
        "/api/v1/files",
        files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")},
        data={"project_id": _PROJECT_ID, "defer_parse": "true"},
    )

    assert resp.status_code == 200
    assert resp.json()["message"] == "文件上传成功，等待远端解析结果"
    assert upload_mock.await_args.kwargs["defer_parse"] is True


def test_upload_file_idempotency_hit_returns_cached(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    cached = {
        "success": True,
        "data": {"file": {"id": "f-cached", "file_type": "pdf", "file_size": 3}},
        "message": "文件上传成功",
    }
    get_idempotency = AsyncMock(return_value=cached)
    save_idempotency = AsyncMock(return_value=None)
    monkeypatch.setattr(db_service, "get_idempotency_response", get_idempotency)
    monkeypatch.setattr(db_service, "save_idempotency_response", save_idempotency)
    save_file_mock = AsyncMock(side_effect=AssertionError("should not save file"))
    monkeypatch.setattr(file_service, "save_file", save_file_mock)

    resp = client.post(
        "/api/v1/files",
        files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")},
        data={"project_id": _PROJECT_ID, "session_id": "s-001"},
        headers={"Idempotency-Key": "00000000-0000-0000-0000-000000000012"},
    )
    assert resp.status_code == 200
    assert resp.json() == cached
    get_idempotency.assert_awaited_once_with(
        "files:single:u-001:p-001:s-001:00000000-0000-0000-0000-000000000012"
    )
    save_idempotency.assert_not_awaited()


def test_upload_file_invalid_idempotency_key_400(client, _as_user):
    resp = client.post(
        "/api/v1/files",
        files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")},
        data={"project_id": _PROJECT_ID},
        headers={"Idempotency-Key": "invalid"},
    )
    assert resp.status_code == 400


def test_upload_file_project_not_found_404(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", None)

    resp = client.post(
        "/api/v1/files",
        files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")},
        data={"project_id": _PROJECT_ID},
    )
    assert resp.status_code == 404


def test_upload_file_forbidden_403(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project(user_id="other"))

    resp = client.post(
        "/api/v1/files",
        files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")},
        data={"project_id": _PROJECT_ID},
    )
    assert resp.status_code == 403


def test_upload_file_internal_error_uses_unified_error_contract(
    client, monkeypatch, _as_user
):
    monkeypatch.setattr(
        "routers.files.uploads.upload_file_response",
        AsyncMock(side_effect=RuntimeError("upload failed")),
    )

    resp = client.post(
        "/api/v1/files",
        files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")},
        data={"project_id": _PROJECT_ID},
    )
    assert resp.status_code == 500
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert body["error"]["message"] == "文件上传失败"
    assert body["error"]["retryable"] is False
    assert body["error"]["trace_id"]


def test_batch_upload_partial_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    _mock(monkeypatch, db_service, "get_idempotency_response", None)
    save_idempotency = AsyncMock(return_value=None)
    monkeypatch.setattr(db_service, "save_idempotency_response", save_idempotency)

    save_file_mock = AsyncMock(return_value=("uploads/a.pdf", 3))
    monkeypatch.setattr(file_service, "save_file", save_file_mock)

    _mock(monkeypatch, db_service, "create_upload", _fake_upload())
    _mock(monkeypatch, db_service, "update_upload_status", _fake_upload())
    _mock(monkeypatch, db_service, "get_file", _fake_upload())

    resp = client.post(
        "/api/v1/files/batch",
        files=[
            ("files", ("a.pdf", b"%PDF-1.4", "application/pdf")),
            ("files", ("b.exe", b"123", "application/octet-stream")),
        ],
        data={"project_id": _PROJECT_ID},
    )
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["total"] == 1
    assert len(body["failed"]) == 1
    save_idempotency.assert_not_awaited()


def test_batch_upload_idempotency_hit_returns_cached(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    cached = {
        "success": True,
        "data": {"files": [{"id": "f-cached"}], "total": 1, "failed": None},
        "message": "批量上传完成",
    }
    get_idempotency = AsyncMock(return_value=cached)
    save_idempotency = AsyncMock(return_value=None)
    monkeypatch.setattr(db_service, "get_idempotency_response", get_idempotency)
    monkeypatch.setattr(db_service, "save_idempotency_response", save_idempotency)
    save_file_mock = AsyncMock(side_effect=AssertionError("should not save files"))
    monkeypatch.setattr(file_service, "save_file", save_file_mock)

    resp = client.post(
        "/api/v1/files/batch",
        files=[("files", ("a.pdf", b"%PDF-1.4", "application/pdf"))],
        data={"project_id": _PROJECT_ID, "session_id": "s-001"},
        headers={"Idempotency-Key": "00000000-0000-0000-0000-000000000013"},
    )
    assert resp.status_code == 200
    assert resp.json() == cached
    get_idempotency.assert_awaited_once_with(
        "files:batch:u-001:p-001:s-001:00000000-0000-0000-0000-000000000013"
    )
    save_idempotency.assert_not_awaited()


def test_batch_upload_persists_idempotency_on_miss(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    get_idempotency = AsyncMock(return_value=None)
    save_idempotency = AsyncMock(return_value=None)
    monkeypatch.setattr(db_service, "get_idempotency_response", get_idempotency)
    monkeypatch.setattr(db_service, "save_idempotency_response", save_idempotency)
    save_file_mock = AsyncMock(return_value=("uploads/a.pdf", 3))
    monkeypatch.setattr(file_service, "save_file", save_file_mock)
    _mock(monkeypatch, db_service, "create_upload", _fake_upload())
    _mock(monkeypatch, db_service, "update_upload_status", _fake_upload())
    _mock(monkeypatch, db_service, "get_file", _fake_upload())

    resp = client.post(
        "/api/v1/files/batch",
        files=[("files", ("a.pdf", b"%PDF-1.4", "application/pdf"))],
        data={"project_id": _PROJECT_ID, "session_id": "s-001"},
        headers={"Idempotency-Key": "00000000-0000-0000-0000-000000000014"},
    )
    assert resp.status_code == 200
    get_idempotency.assert_awaited_once_with(
        "files:batch:u-001:p-001:s-001:00000000-0000-0000-0000-000000000014"
    )
    save_idempotency.assert_awaited_once()


def test_apply_mineru_parse_result_success(client, monkeypatch, _as_user):
    response_payload = {
        "success": True,
        "data": {"file": {"id": _FILE_ID, "status": "ready"}},
        "message": "MinerU 解析结果已同步并完成索引",
    }
    apply_mock = AsyncMock(return_value=response_payload)
    monkeypatch.setattr(
        "routers.files.uploads.apply_mineru_parse_result_response",
        apply_mock,
    )

    resp = client.post(
        f"/api/v1/files/{_FILE_ID}/parse/mineru",
        json={
            "parsed_text": "parsed by mineru",
            "parse_details": {"pages_extracted": 2},
        },
    )

    assert resp.status_code == 200
    assert resp.json()["message"] == "MinerU 解析结果已同步并完成索引"
    assert apply_mock.await_args.kwargs["file_id"] == _FILE_ID


def test_trigger_fallback_parse_success(client, monkeypatch, _as_user):
    response_payload = {
        "success": True,
        "data": {"file": {"id": _FILE_ID, "status": "parsing"}},
        "message": "已触发后端降级解析",
    }
    trigger_mock = AsyncMock(return_value=response_payload)
    monkeypatch.setattr(
        "routers.files.uploads.trigger_fallback_parse_response",
        trigger_mock,
    )

    resp = client.post(
        f"/api/v1/files/{_FILE_ID}/parse/fallback",
        json={"session_id": "s-001"},
    )

    assert resp.status_code == 200
    assert resp.json()["message"] == "已触发后端降级解析"
    assert trigger_mock.await_args.kwargs["file_id"] == _FILE_ID


def test_update_file_intent_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_file", _fake_upload())
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    _mock(
        monkeypatch,
        db_service,
        "update_file_intent",
        _fake_upload(usageIntent="primary"),
    )

    resp = client.patch(
        f"/api/v1/files/{_FILE_ID}/intent",
        json={"usage_intent": "primary"},
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True


def test_update_file_intent_not_found_404(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_file", None)

    resp = client.patch(
        f"/api/v1/files/{_FILE_ID}/intent",
        json={"usage_intent": "primary"},
    )
    assert resp.status_code == 404


def test_update_file_intent_forbidden_403(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_file", _fake_upload())
    _mock(monkeypatch, db_service, "get_project", _fake_project(user_id="other"))

    resp = client.patch(
        f"/api/v1/files/{_FILE_ID}/intent",
        json={"usage_intent": "primary"},
    )
    assert resp.status_code == 403


def test_batch_delete_files_mixed_result(client, monkeypatch, _as_user):
    uploads = {
        "f-ok": _fake_upload(file_id="f-ok"),
        "f-other": _fake_upload(file_id="f-other"),
    }

    async def get_file(file_id):
        return uploads.get(file_id)

    async def get_project(project_id):
        if project_id == _PROJECT_ID:
            return _fake_project()
        return _fake_project(user_id="other")

    monkeypatch.setattr(db_service, "get_file", AsyncMock(side_effect=get_file))
    monkeypatch.setattr(db_service, "get_project", AsyncMock(side_effect=get_project))
    monkeypatch.setattr(db_service, "delete_file", AsyncMock(return_value=True))

    # force one forbidden by changing projectId on f-other
    uploads["f-other"].projectId = "p-other"

    resp = client.request(
        "DELETE",
        "/api/v1/files/batch",
        json={"file_ids": ["f-ok", "f-missing", "f-other"]},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["deleted"] == 1
    assert len(data["failed"]) == 2


def test_delete_file_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_file", _fake_upload())
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    _mock(monkeypatch, db_service, "delete_file", True)

    resp = client.delete(f"/api/v1/files/{_FILE_ID}")
    assert resp.status_code == 200
    assert resp.json()["data"]["file_id"] == _FILE_ID


def test_delete_file_not_found_404(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_file", None)

    resp = client.delete(f"/api/v1/files/{_FILE_ID}")
    assert resp.status_code == 404


def test_delete_file_forbidden_403(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_file", _fake_upload())
    _mock(monkeypatch, db_service, "get_project", _fake_project(user_id="other"))

    resp = client.delete(f"/api/v1/files/{_FILE_ID}")
    assert resp.status_code == 403


def test_delete_file_internal_error_uses_unified_error_contract(
    client, monkeypatch, _as_user
):
    monkeypatch.setattr(
        "routers.files.mutations.delete_file_response",
        AsyncMock(side_effect=RuntimeError("delete failed")),
    )

    resp = client.delete(f"/api/v1/files/{_FILE_ID}")
    assert resp.status_code == 500
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert body["error"]["message"] == "删除文件失败"
    assert body["error"]["retryable"] is False
    assert body["error"]["trace_id"]


def test_files_no_token_401(client):
    resp = client.delete(f"/api/v1/files/{_FILE_ID}")
    assert resp.status_code == 401
