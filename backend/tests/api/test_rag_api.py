from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from main import app
from services.database import db_service
from utils.dependencies import get_current_user
from utils.exceptions import (
    ErrorCode,
    ExternalServiceException,
    NotFoundException,
    ValidationException,
)

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


def test_web_search_internal_error_uses_unified_error_contract(
    client, monkeypatch, _as_user
):
    monkeypatch.setattr(
        "routers.rag.enrichment.web_search_response",
        AsyncMock(side_effect=RuntimeError("provider down")),
    )
    resp = client.post("/api/v1/rag/web-search?query=physics&project_id=p-001")
    assert resp.status_code == 500
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert body["error"]["message"] == "网络搜索失败"
    assert body["error"]["retryable"] is False
    assert body["error"]["trace_id"]


def test_get_source_image_success(client, monkeypatch, _as_user):
    payload = SimpleNamespace(
        content=b"img-bytes",
        media_type="image/jpeg",
        etag='"abc"',
        cache_control="private, max-age=86400",
    )
    monkeypatch.setattr(
        "routers.rag.core.get_source_image_response",
        AsyncMock(return_value=payload),
    )

    resp = client.get("/api/v1/rag/sources/chunk-1/image?path=images/a.jpg")
    assert resp.status_code == 200
    assert resp.content == b"img-bytes"
    assert resp.headers["content-type"].startswith("image/jpeg")
    assert resp.headers["etag"] == '"abc"'
    assert resp.headers["cache-control"] == "private, max-age=86400"


def test_get_source_image_invalid_path(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        "routers.rag.core.get_source_image_response",
        AsyncMock(side_effect=ValidationException(message="bad path")),
    )
    resp = client.get("/api/v1/rag/sources/chunk-1/image?path=../evil.jpg")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_get_source_image_missing_chunk(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        "routers.rag.core.get_source_image_response",
        AsyncMock(side_effect=NotFoundException(message="not found")),
    )
    resp = client.get("/api/v1/rag/sources/chunk-1/image?path=images/a.jpg")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_get_source_image_timeout(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        "routers.rag.core.get_source_image_response",
        AsyncMock(
            side_effect=ExternalServiceException(
                message="timeout",
                status_code=504,
                error_code=ErrorCode.UPSTREAM_TIMEOUT,
                retryable=True,
            )
        ),
    )
    resp = client.get("/api/v1/rag/sources/chunk-1/image?path=images/a.jpg")
    assert resp.status_code == 504
    assert resp.json()["error"]["code"] == "UPSTREAM_TIMEOUT"
