from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from main import app
from services.database import db_service
from utils.dependencies import get_current_user

_NOW = datetime.now(timezone.utc)


def _fake_project(user_id="u-001"):
    return SimpleNamespace(
        id="p-001",
        userId=user_id,
        name="RAG Project",
        createdAt=_NOW,
        updatedAt=_NOW,
    )


@pytest.fixture()
def _as_user():
    app.dependency_overrides[get_current_user] = lambda: "u-001"
    yield
    app.dependency_overrides.pop(get_current_user, None)


def test_web_search_max_results_bound(client, _as_user):
    resp = client.post(
        "/api/v1/rag/web-search?query=physics&project_id=p-001&max_results=21"
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_audio_transcribe_requires_project_when_auto_index(client, _as_user):
    resp = client.post(
        "/api/v1/rag/audio-transcribe",
        files={"file": ("voice.wav", b"abc", "audio/wav")},
        data={"auto_index": "true"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_video_analyze_requires_project_when_auto_index(client, _as_user):
    resp = client.post(
        "/api/v1/rag/video-analyze",
        files={"file": ("clip.mp4", b"abc", "video/mp4")},
        data={"auto_index": "true"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_audio_transcribe_project_id_from_form(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        db_service,
        "get_project",
        AsyncMock(return_value=_fake_project(user_id="other-user")),
    )
    resp = client.post(
        "/api/v1/rag/audio-transcribe",
        files={"file": ("voice.wav", b"abc", "audio/wav")},
        data={"project_id": "p-001"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "FORBIDDEN"


def test_video_analyze_project_id_from_form(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        db_service,
        "get_project",
        AsyncMock(return_value=_fake_project(user_id="other-user")),
    )
    resp = client.post(
        "/api/v1/rag/video-analyze",
        files={"file": ("clip.mp4", b"abc", "video/mp4")},
        data={"project_id": "p-001"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "FORBIDDEN"
