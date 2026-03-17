from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from main import app
from services.project_space_service import project_space_service
from utils.dependencies import get_current_user

_NOW = datetime.now(timezone.utc)
_USER_ID = "u-ps-001"
_PROJECT_ID = "p-ps-001"


@pytest.fixture()
def _as_user():
    app.dependency_overrides[get_current_user] = lambda: _USER_ID
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _fake_artifact(
    artifact_id: str = "a-001",
    artifact_type: str = "mp4",
    storage_path: str = "uploads/artifacts/p-ps-001/mp4/a-001.mp4",
):
    return SimpleNamespace(
        id=artifact_id,
        projectId=_PROJECT_ID,
        sessionId=None,
        basedOnVersionId=None,
        ownerUserId=_USER_ID,
        type=artifact_type,
        visibility="private",
        storagePath=storage_path,
        metadata='{"created_by":"u-ps-001"}',
        createdAt=_NOW,
        updatedAt=_NOW,
    )


def _fake_version(
    version_id: str = "v-001",
    project_id: str = _PROJECT_ID,
):
    return SimpleNamespace(
        id=version_id,
        projectId=project_id,
        parentVersionId=None,
        summary="version summary",
        changeType="author-update",
        snapshotData='{"k":"v"}',
        createdBy=_USER_ID,
        createdAt=_NOW,
    )


def test_get_project_versions_success(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        project_space_service,
        "get_project_versions",
        AsyncMock(return_value=[_fake_version()]),
    )

    resp = client.get(f"/api/v1/projects/{_PROJECT_ID}/versions")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["versions"][0]["id"] == "v-001"
    assert body["data"]["versions"][0]["project_id"] == _PROJECT_ID


def test_get_project_version_detail_success(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        project_space_service,
        "get_project_version",
        AsyncMock(return_value=_fake_version(version_id="v-002")),
    )

    resp = client.get(f"/api/v1/projects/{_PROJECT_ID}/versions/v-002")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["version"]["id"] == "v-002"
    assert body["data"]["version"]["project_id"] == _PROJECT_ID


def test_get_project_version_mismatch_project_404(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        project_space_service,
        "get_project_version",
        AsyncMock(return_value=_fake_version(project_id="other-project")),
    )

    resp = client.get(f"/api/v1/projects/{_PROJECT_ID}/versions/v-003")
    assert resp.status_code == 404


def test_get_project_artifacts_with_filters_success(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    get_artifacts = AsyncMock(return_value=[_fake_artifact(artifact_type="summary")])
    monkeypatch.setattr(project_space_service, "get_project_artifacts", get_artifacts)

    resp = client.get(
        f"/api/v1/projects/{_PROJECT_ID}/artifacts"
        "?type=summary&visibility=private&owner_user_id=u-ps-001&based_on_version_id=v-1"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["artifacts"][0]["type"] == "summary"
    get_artifacts.assert_awaited_once_with(
        _PROJECT_ID,
        type_filter="summary",
        visibility_filter="private",
        owner_user_id_filter="u-ps-001",
        based_on_version_id_filter="v-1",
    )


def test_get_artifact_detail_success(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        project_space_service,
        "get_artifact",
        AsyncMock(
            return_value=_fake_artifact(artifact_id="a-008", artifact_type="gif")
        ),
    )

    resp = client.get(f"/api/v1/projects/{_PROJECT_ID}/artifacts/a-008")
    assert resp.status_code == 200
    assert resp.json()["data"]["artifact"]["id"] == "a-008"


def test_get_artifact_mismatch_project_404(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    artifact = _fake_artifact(artifact_id="a-009")
    artifact.projectId = "another-project"
    monkeypatch.setattr(
        project_space_service,
        "get_artifact",
        AsyncMock(return_value=artifact),
    )

    resp = client.get(f"/api/v1/projects/{_PROJECT_ID}/artifacts/a-009")
    assert resp.status_code == 404


def test_create_artifact_mp4_success(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        project_space_service,
        "create_artifact_with_file",
        AsyncMock(return_value=_fake_artifact(artifact_type="mp4")),
    )

    resp = client.post(
        f"/api/v1/projects/{_PROJECT_ID}/artifacts",
        json={"type": "mp4", "visibility": "private"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["artifact"]["type"] == "mp4"


def test_create_artifact_pptx_success(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        project_space_service,
        "create_artifact_with_file",
        AsyncMock(return_value=_fake_artifact(artifact_type="pptx")),
    )

    resp = client.post(
        f"/api/v1/projects/{_PROJECT_ID}/artifacts",
        json={"type": "pptx", "visibility": "private"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["artifact"]["type"] == "pptx"


def test_create_artifact_invalid_type_400(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )

    # ArtifactCreateType should reject unsupported values.
    resp = client.post(
        f"/api/v1/projects/{_PROJECT_ID}/artifacts",
        json={"type": "xls", "visibility": "private"},
    )
    assert resp.status_code == 400


def test_download_artifact_gif_success(client, monkeypatch, tmp_path, _as_user):
    gif_path = tmp_path / "demo.gif"
    gif_path.write_bytes(
        b"GIF89a\x01\x00\x01\x00\x80\x00\x00"
        b"\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00"
        b",\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
    )

    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        project_space_service,
        "get_artifact",
        AsyncMock(
            return_value=_fake_artifact(
                artifact_id="a-gif-001",
                artifact_type="gif",
                storage_path=str(gif_path),
            )
        ),
    )

    resp = client.get(
        f"/api/v1/projects/{_PROJECT_ID}/artifacts/a-gif-001/download",
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("image/gif")
    assert "a-gif-001.gif" in resp.headers.get("content-disposition", "")


def test_download_artifact_mp4_success(client, monkeypatch, tmp_path, _as_user):
    mp4_path = tmp_path / "demo.mp4"
    mp4_path.write_bytes(
        b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom\x00\x00\x00\x08free"
    )

    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        project_space_service,
        "get_artifact",
        AsyncMock(
            return_value=_fake_artifact(
                artifact_id="a-mp4-001",
                artifact_type="mp4",
                storage_path=str(mp4_path),
            )
        ),
    )

    resp = client.get(
        f"/api/v1/projects/{_PROJECT_ID}/artifacts/a-mp4-001/download",
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("video/mp4")
    assert "a-mp4-001.mp4" in resp.headers.get("content-disposition", "")
