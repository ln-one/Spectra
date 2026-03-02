"""Generate API contract tests for C9 scope."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from main import app
from services.database import db_service
from utils.dependencies import get_current_user

_NOW = datetime.now(timezone.utc)
_USER_ID = "u-001"
_PROJECT_ID = "p-001"
_TASK_ID = "t-001"


@pytest.fixture()
def _as_user():
    app.dependency_overrides[get_current_user] = lambda: _USER_ID
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _mock(mp, obj, attr, rv=None):
    mp.setattr(obj, attr, AsyncMock(return_value=rv))


def _fake_project(user_id=_USER_ID):
    return SimpleNamespace(id=_PROJECT_ID, userId=user_id, name="Project A")


def _fake_task(**kw):
    data = dict(
        id=_TASK_ID,
        projectId=_PROJECT_ID,
        taskType="pptx",
        status="pending",
        progress=0,
        outputUrls='{"pptx":"/api/v1/generate/tasks/t-001/download?file_type=ppt"}',
        errorMessage=None,
        createdAt=_NOW,
        updatedAt=_NOW,
    )
    data.update(kw)
    return SimpleNamespace(**data)


def test_generate_courseware_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    _mock(monkeypatch, db_service, "get_idempotency_response", None)
    _mock(monkeypatch, db_service, "create_generation_task", _fake_task())
    _mock(monkeypatch, db_service, "update_generation_task_rq_job_id", None)
    save_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(db_service, "save_idempotency_response", save_mock)

    # Mock TaskQueueService
    from unittest.mock import Mock

    mock_job = Mock()
    mock_job.id = "rq-job-123"
    mock_task_queue = Mock()
    mock_task_queue.enqueue_generation_task.return_value = mock_job

    from main import app

    monkeypatch.setattr(app.state, "task_queue_service", mock_task_queue, raising=False)

    resp = client.post(
        "/api/v1/generate/courseware",
        json={"project_id": _PROJECT_ID, "type": "pptx"},
        headers={"Idempotency-Key": "00000000-0000-0000-0000-000000000021"},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["task_id"] == _TASK_ID
    assert body["data"]["status"] == "pending"
    save_mock.assert_awaited_once()


def test_generate_courseware_idempotency_hit(client, monkeypatch, _as_user):
    cached = {
        "success": True,
        "data": {"task_id": "cached-task", "status": "pending"},
        "message": "cached",
    }
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    _mock(monkeypatch, db_service, "get_idempotency_response", cached)
    create_task_mock = AsyncMock()
    monkeypatch.setattr(db_service, "create_generation_task", create_task_mock)

    resp = client.post(
        "/api/v1/generate/courseware",
        json={"project_id": _PROJECT_ID, "type": "pptx"},
        headers={"Idempotency-Key": "00000000-0000-0000-0000-000000000022"},
    )

    assert resp.status_code == 200
    assert resp.json()["data"]["task_id"] == "cached-task"
    create_task_mock.assert_not_awaited()


def test_generate_courseware_invalid_idempotency_400(client, _as_user):
    resp = client.post(
        "/api/v1/generate/courseware",
        json={"project_id": _PROJECT_ID, "type": "pptx"},
        headers={"Idempotency-Key": "invalid-uuid"},
    )
    assert resp.status_code == 400


def test_generate_courseware_not_found_404(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", None)

    resp = client.post(
        "/api/v1/generate/courseware",
        json={"project_id": _PROJECT_ID, "type": "pptx"},
    )
    assert resp.status_code == 404


def test_generate_courseware_forbidden_403(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project(user_id="other"))

    resp = client.post(
        "/api/v1/generate/courseware",
        json={"project_id": _PROJECT_ID, "type": "pptx"},
    )
    assert resp.status_code == 403


def test_generate_courseware_no_token_401(client):
    resp = client.post(
        "/api/v1/generate/courseware",
        json={"project_id": _PROJECT_ID, "type": "pptx"},
    )
    assert resp.status_code == 401


def test_get_generation_status_success(client, monkeypatch, _as_user):
    _mock(
        monkeypatch, db_service, "get_generation_task", _fake_task(status="completed")
    )
    _mock(monkeypatch, db_service, "get_project", _fake_project())

    resp = client.get(f"/api/v1/generate/tasks/{_TASK_ID}/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["task_id"] == _TASK_ID
    assert body["data"]["status"] == "completed"
    assert body["data"]["result"]["pptx"]


def test_get_generation_status_output_urls_invalid_json(client, monkeypatch, _as_user):
    _mock(
        monkeypatch,
        db_service,
        "get_generation_task",
        _fake_task(outputUrls="not-json"),
    )
    _mock(monkeypatch, db_service, "get_project", _fake_project())

    resp = client.get(f"/api/v1/generate/tasks/{_TASK_ID}/status")
    assert resp.status_code == 200
    assert resp.json()["data"]["result"] is None


def test_get_generation_status_not_found_404(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_generation_task", None)

    resp = client.get(f"/api/v1/generate/tasks/{_TASK_ID}/status")
    assert resp.status_code == 404


def test_get_generation_status_forbidden_403(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_generation_task", _fake_task())
    _mock(monkeypatch, db_service, "get_project", _fake_project(user_id="other"))

    resp = client.get(f"/api/v1/generate/tasks/{_TASK_ID}/status")
    assert resp.status_code == 403


def test_get_generation_status_no_token_401(client):
    resp = client.get(f"/api/v1/generate/tasks/{_TASK_ID}/status")
    assert resp.status_code == 401


def test_get_task_versions_pending_includes_current_task(client, monkeypatch, _as_user):
    _mock(
        monkeypatch,
        db_service,
        "get_generation_task",
        _fake_task(status="pending", outputUrls=None),
    )
    _mock(monkeypatch, db_service, "get_project", _fake_project())

    resp = client.get(f"/api/v1/generate/tasks/{_TASK_ID}/versions")
    assert resp.status_code == 200
    versions = resp.json()["data"]["versions"]
    assert len(versions) == 1
    assert versions[0]["version"] == 1
    assert versions[0]["status"] == "pending"


def test_get_task_versions_completed_returns_file_urls(client, monkeypatch, _as_user):
    _mock(
        monkeypatch,
        db_service,
        "get_generation_task",
        _fake_task(
            status="completed",
            outputUrls='{"pptx":"/ppt-url","docx":"/doc-url"}',
        ),
    )
    _mock(monkeypatch, db_service, "get_project", _fake_project())

    resp = client.get(f"/api/v1/generate/tasks/{_TASK_ID}/versions")
    assert resp.status_code == 200
    version = resp.json()["data"]["versions"][0]
    assert version["file_urls"]["ppt_url"] == "/ppt-url"
    assert version["file_urls"]["word_url"] == "/doc-url"
