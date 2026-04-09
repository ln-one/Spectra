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


def _fake_reference():
    return SimpleNamespace(
        id="r-001",
        projectId=_PROJECT_ID,
        targetProjectId="p-target-001",
        relationType="base",
        mode="follow",
        pinnedVersionId=None,
        priority=0,
        status="active",
        createdBy=_USER_ID,
        createdAt=_NOW,
        updatedAt=_NOW,
    )


def _fake_version():
    return SimpleNamespace(
        id="v-001",
        projectId=_PROJECT_ID,
        parentVersionId=None,
        summary="version summary",
        changeType="author-update",
        snapshotData='{"k":"v"}',
        createdBy=_USER_ID,
        createdAt=_NOW,
    )


def _fake_artifact():
    return SimpleNamespace(
        id="a-001",
        projectId=_PROJECT_ID,
        sessionId="s-001",
        basedOnVersionId="v-001",
        ownerUserId=_USER_ID,
        type="summary",
        visibility="private",
        storagePath="uploads/artifacts/p-ps-001/summary/a-001.json",
        metadata='{"kind":"outline"}',
        createdAt=_NOW,
        updatedAt=_NOW,
    )


def _fake_member():
    return SimpleNamespace(
        id="m-001",
        projectId=_PROJECT_ID,
        userId="u-member-001",
        role="editor",
        permissions='{"can_view": true}',
        status="active",
        createdAt=_NOW,
    )


def _fake_change():
    return SimpleNamespace(
        id="c-001",
        projectId=_PROJECT_ID,
        sessionId="s-001",
        baseVersionId="v-001",
        title="candidate change",
        summary="summary",
        payload='{"source":"mock"}',
        changeKind="artifact_update",
        changeContext='{"entry":"studio"}',
        acceptedSnapshot=None,
        status="pending",
        reviewComment=None,
        reviewedBy=None,
        reviewedAt=None,
        acceptedVersionId=None,
        proposerUserId=_USER_ID,
        createdAt=_NOW,
        updatedAt=_NOW,
    )


def test_get_project_references_returns_thin_ourograph_shape(
    client, monkeypatch, _as_user
):
    monkeypatch.setattr(
        project_space_service,
        "get_project_references",
        AsyncMock(return_value=[_fake_reference()]),
    )

    resp = client.get(f"/api/v1/projects/{_PROJECT_ID}/references")

    assert resp.status_code == 200
    body = resp.json()
    assert body["references"][0]["projectId"] == _PROJECT_ID
    assert body["references"][0]["targetProjectId"] == "p-target-001"
    assert "success" not in body


def test_get_project_versions_returns_current_version_wrapper(
    client, monkeypatch, _as_user
):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        project_space_service,
        "get_project_versions_with_context",
        AsyncMock(return_value=([_fake_version()], "v-001")),
    )

    resp = client.get(f"/api/v1/projects/{_PROJECT_ID}/versions")

    assert resp.status_code == 200
    body = resp.json()
    assert body["currentVersionId"] == "v-001"
    assert body["versions"][0]["snapshotData"] == {"k": "v"}


def test_get_project_artifacts_returns_thin_ourograph_shape(
    client, monkeypatch, _as_user
):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        project_space_service,
        "get_project_artifacts",
        AsyncMock(return_value=[_fake_artifact()]),
    )

    resp = client.get(f"/api/v1/projects/{_PROJECT_ID}/artifacts")

    assert resp.status_code == 200
    body = resp.json()
    assert body["artifacts"][0]["basedOnVersionId"] == "v-001"
    assert body["artifacts"][0]["metadata"] == {"kind": "outline"}


def test_get_project_members_returns_thin_ourograph_shape(
    client, monkeypatch, _as_user
):
    monkeypatch.setattr(
        project_space_service,
        "get_project_members",
        AsyncMock(return_value=[_fake_member()]),
    )

    resp = client.get(f"/api/v1/projects/{_PROJECT_ID}/members")

    assert resp.status_code == 200
    body = resp.json()
    assert body["members"][0]["userId"] == "u-member-001"


def test_get_candidate_changes_returns_thin_ourograph_shape(
    client, monkeypatch, _as_user
):
    monkeypatch.setattr(
        project_space_service,
        "get_candidate_changes",
        AsyncMock(return_value=[_fake_change()]),
    )

    resp = client.get(f"/api/v1/projects/{_PROJECT_ID}/candidate-changes")

    assert resp.status_code == 200
    body = resp.json()
    assert body["changes"][0]["changeKind"] == "artifact_update"
    assert body["changes"][0]["changeContext"] == {"entry": "studio"}
