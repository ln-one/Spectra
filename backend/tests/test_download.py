"""Tests for the download endpoint."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from main import app
from services.database import db_service
from utils.dependencies import get_current_user

_TASK_ID = "task-001"
_USER_ID = "u-001"


def _fake_task(**kw):
    d = dict(id=_TASK_ID, projectId="proj-001", status="completed")
    d.update(kw)
    return SimpleNamespace(**d)


def _fake_project(**kw):
    d = dict(id="proj-001", userId=_USER_ID, name="Test Course")
    d.update(kw)
    return SimpleNamespace(**d)


@pytest.fixture(autouse=True)
def _as_user():
    app.dependency_overrides[get_current_user] = lambda: _USER_ID
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _mock_db(monkeypatch, task=None, project=None):
    monkeypatch.setattr(
        db_service, "get_generation_task", AsyncMock(return_value=task)
    )
    monkeypatch.setattr(db_service, "get_project", AsyncMock(return_value=project))


def test_download_ppt_success(client, tmp_path, monkeypatch):
    _mock_db(monkeypatch, task=_fake_task(), project=_fake_project())
    monkeypatch.chdir(tmp_path)
    generated_dir = tmp_path / "generated"
    generated_dir.mkdir()
    (generated_dir / f"{_TASK_ID}.pptx").write_bytes(b"fake pptx content")

    resp = client.get(f"/api/v1/generate/tasks/{_TASK_ID}/download?file_type=ppt")
    assert resp.status_code == 200
    assert "presentation" in resp.headers["content-type"]


def test_download_word_success(client, tmp_path, monkeypatch):
    _mock_db(monkeypatch, task=_fake_task(), project=_fake_project())
    monkeypatch.chdir(tmp_path)
    generated_dir = tmp_path / "generated"
    generated_dir.mkdir()
    (generated_dir / f"{_TASK_ID}_lesson_plan.docx").write_bytes(b"fake docx content")

    resp = client.get(f"/api/v1/generate/tasks/{_TASK_ID}/download?file_type=word")
    assert resp.status_code == 200
    assert "wordprocessingml" in resp.headers["content-type"]


def test_download_task_not_found_404(client, monkeypatch):
    _mock_db(monkeypatch, task=None)

    resp = client.get(f"/api/v1/generate/tasks/{_TASK_ID}/download?file_type=ppt")
    assert resp.status_code == 404


def test_download_forbidden_403(client, monkeypatch):
    _mock_db(monkeypatch, task=_fake_task(), project=_fake_project(userId="other"))

    resp = client.get(f"/api/v1/generate/tasks/{_TASK_ID}/download?file_type=ppt")
    assert resp.status_code == 403


def test_download_task_not_completed_400(client, monkeypatch):
    _mock_db(
        monkeypatch, task=_fake_task(status="pending"), project=_fake_project()
    )

    resp = client.get(f"/api/v1/generate/tasks/{_TASK_ID}/download?file_type=ppt")
    assert resp.status_code == 400


def test_download_file_missing_404(client, tmp_path, monkeypatch):
    _mock_db(monkeypatch, task=_fake_task(), project=_fake_project())
    monkeypatch.chdir(tmp_path)
    (tmp_path / "generated").mkdir()

    resp = client.get(f"/api/v1/generate/tasks/{_TASK_ID}/download?file_type=ppt")
    assert resp.status_code == 404


def test_download_invalid_file_type_400(client):
    resp = client.get(
        f"/api/v1/generate/tasks/{_TASK_ID}/download?file_type=invalid"
    )
    assert resp.status_code == 400
