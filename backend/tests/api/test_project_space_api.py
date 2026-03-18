from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from main import app
from services.project_space_service import project_space_service
from utils.dependencies import get_current_user
from utils.exceptions import ConflictException

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
    metadata: str = '{"created_by":"u-ps-001"}',
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
        metadata=metadata,
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


def _fake_reference(reference_id: str = "r-001", status: str = "active"):
    return SimpleNamespace(
        id=reference_id,
        projectId=_PROJECT_ID,
        targetProjectId="p-target-001",
        relationType="auxiliary",
        mode="follow",
        pinnedVersionId=None,
        priority=0,
        status=status,
        createdBy=_USER_ID,
        createdAt=_NOW,
        updatedAt=_NOW,
    )


def _fake_change(
    change_id: str = "c-001",
    status: str = "pending",
    payload: str = '{"k":"v"}',
    review_comment: str | None = None,
):
    return SimpleNamespace(
        id=change_id,
        projectId=_PROJECT_ID,
        title="candidate change",
        summary="summary",
        payload=payload,
        sessionId="s-001",
        baseVersionId="v-001",
        status=status,
        proposerUserId=_USER_ID,
        reviewComment=review_comment,
        createdAt=_NOW,
        updatedAt=_NOW,
    )


def _fake_member(member_id: str = "m-001", user_id: str = "u-member-001"):
    return SimpleNamespace(
        id=member_id,
        projectId=_PROJECT_ID,
        userId=user_id,
        role="editor",
        permissions='{"can_view": true, "can_collaborate": true}',
        status="active",
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
        "?type=summary&visibility=private&owner_user_id=u-ps-001"
        "&based_on_version_id=v-1"
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
            return_value=_fake_artifact(
                artifact_id="a-008",
                artifact_type="gif",
            )
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
        AsyncMock(
            return_value=_fake_artifact(
                artifact_type="pptx",
                metadata='{"created_by":"u-ps-001","capability":"ppt"}',
            )
        ),
    )

    resp = client.post(
        f"/api/v1/projects/{_PROJECT_ID}/artifacts",
        json={"type": "pptx", "visibility": "private"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["artifact"]["type"] == "pptx"
    assert body["data"]["artifact"]["metadata"]["capability"] == "ppt"


def test_create_artifact_docx_sets_word_capability_metadata(
    client, monkeypatch, _as_user
):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        project_space_service,
        "create_artifact_with_file",
        AsyncMock(
            return_value=_fake_artifact(
                artifact_id="a-docx-word-001",
                artifact_type="docx",
                storage_path="uploads/artifacts/p-ps-001/docx/a-docx-word-001.docx",
                metadata='{"created_by":"u-ps-001","capability":"word"}',
            )
        ),
    )

    resp = client.post(
        f"/api/v1/projects/{_PROJECT_ID}/artifacts",
        json={"type": "docx", "visibility": "private"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["artifact"]["type"] == "docx"
    assert body["data"]["artifact"]["metadata"]["capability"] == "word"


def test_create_artifact_summary_sets_capability_metadata(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        project_space_service,
        "create_artifact_with_file",
        AsyncMock(
            return_value=_fake_artifact(
                artifact_id="a-summary-default-001",
                artifact_type="summary",
                storage_path=(
                    "uploads/artifacts/p-ps-001/summary/a-summary-default-001.json"
                ),
                metadata='{"created_by":"u-ps-001","capability":"summary"}',
            )
        ),
    )

    resp = client.post(
        f"/api/v1/projects/{_PROJECT_ID}/artifacts",
        json={"type": "summary", "visibility": "private"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["artifact"]["type"] == "summary"
    assert body["data"]["artifact"]["metadata"]["capability"] == "summary"


def test_create_artifact_animation_storyboard_html_success(
    client, monkeypatch, _as_user
):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        project_space_service,
        "create_artifact_with_file",
        AsyncMock(
            return_value=_fake_artifact(
                artifact_id="a-html-001",
                artifact_type="html",
                storage_path=("uploads/artifacts/p-ps-001/html/a-html-001.html"),
                metadata=(
                    '{"created_by":"u-ps-001","kind":"animation_storyboard",'
                    '"capability":"animation"}'
                ),
            )
        ),
    )

    resp = client.post(
        f"/api/v1/projects/{_PROJECT_ID}/artifacts",
        json={
            "type": "html",
            "visibility": "private",
            "mode": "animation_storyboard",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["artifact"]["type"] == "html"
    assert body["data"]["artifact"]["metadata"]["kind"] == "animation_storyboard"


def test_create_artifact_outline_summary_success(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        project_space_service,
        "create_artifact_with_file",
        AsyncMock(
            return_value=_fake_artifact(
                artifact_id="a-summary-001",
                artifact_type="summary",
                storage_path=("uploads/artifacts/p-ps-001/summary/a-summary-001.json"),
                metadata=(
                    '{"created_by":"u-ps-001","kind":"outline",'
                    '"capability":"outline"}'
                ),
            )
        ),
    )

    resp = client.post(
        f"/api/v1/projects/{_PROJECT_ID}/artifacts",
        json={
            "type": "summary",
            "visibility": "private",
            "mode": "outline",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["artifact"]["type"] == "summary"
    assert body["data"]["artifact"]["metadata"]["kind"] == "outline"


def test_create_artifact_handout_docx_success(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        project_space_service,
        "create_artifact_with_file",
        AsyncMock(
            return_value=_fake_artifact(
                artifact_id="a-docx-001",
                artifact_type="docx",
                storage_path="uploads/artifacts/p-ps-001/docx/a-docx-001.docx",
                metadata=(
                    '{"created_by":"u-ps-001","kind":"handout",'
                    '"capability":"handout"}'
                ),
            )
        ),
    )

    resp = client.post(
        f"/api/v1/projects/{_PROJECT_ID}/artifacts",
        json={
            "type": "docx",
            "visibility": "private",
            "mode": "handout",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["artifact"]["type"] == "docx"
    assert body["data"]["artifact"]["metadata"]["kind"] == "handout"


def test_create_artifact_mindmap_sets_capability_metadata(
    client, monkeypatch, _as_user
):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        project_space_service,
        "create_artifact_with_file",
        AsyncMock(
            return_value=_fake_artifact(
                artifact_id="a-mindmap-001",
                artifact_type="mindmap",
                storage_path="uploads/artifacts/p-ps-001/mindmap/a-mindmap-001.json",
                metadata='{"created_by":"u-ps-001","capability":"mindmap"}',
            )
        ),
    )

    resp = client.post(
        f"/api/v1/projects/{_PROJECT_ID}/artifacts",
        json={"type": "mindmap", "visibility": "private"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["artifact"]["type"] == "mindmap"
    assert body["data"]["artifact"]["metadata"]["capability"] == "mindmap"


def test_create_artifact_quiz_sets_capability_metadata(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        project_space_service,
        "create_artifact_with_file",
        AsyncMock(
            return_value=_fake_artifact(
                artifact_id="a-quiz-001",
                artifact_type="exercise",
                storage_path="uploads/artifacts/p-ps-001/exercise/a-quiz-001.json",
                metadata='{"created_by":"u-ps-001","capability":"quiz"}',
            )
        ),
    )

    resp = client.post(
        f"/api/v1/projects/{_PROJECT_ID}/artifacts",
        json={"type": "exercise", "visibility": "private"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["artifact"]["type"] == "exercise"
    assert body["data"]["artifact"]["metadata"]["capability"] == "quiz"


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


@pytest.mark.parametrize(
    ("artifact_type", "suffix", "content", "expected_content_type"),
    [
        ("mindmap", ".json", '{"nodes":[]}', "application/json"),
        ("summary", ".json", '{"summary":"ok"}', "application/json"),
        ("exercise", ".json", '{"questions":[]}', "application/json"),
        ("html", ".html", "<html><body>ok</body></html>", "text/html"),
        (
            "docx",
            ".docx",
            (
                b"PK\x03\x04\x14\x00\x00\x00\x08\x00"
                b"\x00\x00!\x00dummy-docx-placeholder"
            ),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
    ],
)
def test_download_artifact_structured_types_success(
    client,
    monkeypatch,
    tmp_path,
    _as_user,
    artifact_type,
    suffix,
    content,
    expected_content_type,
):
    artifact_path = tmp_path / f"demo{suffix}"
    if isinstance(content, bytes):
        artifact_path.write_bytes(content)
    else:
        artifact_path.write_text(content, encoding="utf-8")

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
                artifact_id=f"a-{artifact_type}-001",
                artifact_type=artifact_type,
                storage_path=str(artifact_path),
            )
        ),
    )

    resp = client.get(
        f"/api/v1/projects/{_PROJECT_ID}/artifacts/a-{artifact_type}-001/download",
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith(expected_content_type)
    assert (
        f"{artifact_type}_a-{artifact_type}-001{suffix}"
        in resp.headers.get("content-disposition", "")
    )


@pytest.mark.parametrize(
    ("artifact_id", "artifact_type", "metadata", "suffix", "content", "expected_content_type"),
    [
        (
            "a-outline-download-001",
            "summary",
            '{"kind":"outline","capability":"outline"}',
            ".json",
            '{"sections":[]}',
            "application/json",
        ),
        (
            "a-handout-download-001",
            "docx",
            '{"kind":"handout","capability":"handout"}',
            ".docx",
            (
                b"PK\x03\x04\x14\x00\x00\x00\x08\x00"
                b"\x00\x00!\x00dummy-handout-placeholder"
            ),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
        (
            "a-animation-download-001",
            "html",
            '{"kind":"animation_storyboard","capability":"animation"}',
            ".html",
            "<html><body>storyboard</body></html>",
            "text/html",
        ),
    ],
)
def test_download_artifact_mapped_semantics_success(
    client,
    monkeypatch,
    tmp_path,
    _as_user,
    artifact_id,
    artifact_type,
    metadata,
    suffix,
    content,
    expected_content_type,
):
    artifact_path = tmp_path / f"{artifact_id}{suffix}"
    if isinstance(content, bytes):
        artifact_path.write_bytes(content)
    else:
        artifact_path.write_text(content, encoding="utf-8")

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
                artifact_id=artifact_id,
                artifact_type=artifact_type,
                storage_path=str(artifact_path),
                metadata=metadata,
            )
        ),
    )

    resp = client.get(
        f"/api/v1/projects/{_PROJECT_ID}/artifacts/{artifact_id}/download",
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith(expected_content_type)
    assert f"{artifact_type}_{artifact_id}{suffix}" in resp.headers.get(
        "content-disposition", ""
    )


def test_get_candidate_changes_with_filters_success(client, monkeypatch, _as_user):
    get_changes = AsyncMock(return_value=[_fake_change(status="accepted")])
    monkeypatch.setattr(project_space_service, "get_candidate_changes", get_changes)

    resp = client.get(
        f"/api/v1/projects/{_PROJECT_ID}/candidate-changes"
        "?status=accepted&proposer_user_id=u-ps-001&session_id=s-001"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["changes"][0]["status"] == "accepted"
    get_changes.assert_awaited_once_with(
        project_id=_PROJECT_ID,
        user_id=_USER_ID,
        status="accepted",
        proposer_user_id="u-ps-001",
        session_id="s-001",
    )


def test_review_candidate_change_success_passes_review_comment(
    client, monkeypatch, _as_user
):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    review_change = AsyncMock(
        return_value=_fake_change(change_id="c-007", status="accepted")
    )
    monkeypatch.setattr(project_space_service, "review_candidate_change", review_change)

    resp = client.post(
        f"/api/v1/projects/{_PROJECT_ID}/candidate-changes/c-007/review",
        json={"action": "accept", "review_comment": "looks good"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["change"]["id"] == "c-007"
    assert body["data"]["change"]["status"] == "accepted"
    review_change.assert_awaited_once_with(
        project_id=_PROJECT_ID,
        change_id="c-007",
        action="accept",
        review_comment="looks good",
        reviewer_user_id=_USER_ID,
    )


def test_review_candidate_change_returns_accepted_version_id(
    client, monkeypatch, _as_user
):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    review_change = AsyncMock(
        return_value=_fake_change(
            change_id="c-009",
            status="accepted",
            payload=(
                '{"review":{"action":"accept","accepted_version_id":"v-002",'
                '"reviewer_user_id":"u-ps-001"}}'
            ),
            review_comment="accepted",
        )
    )
    monkeypatch.setattr(project_space_service, "review_candidate_change", review_change)

    resp = client.post(
        f"/api/v1/projects/{_PROJECT_ID}/candidate-changes/c-009/review",
        json={"action": "accept", "review_comment": "accepted"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["change"]["accepted_version_id"] == "v-002"
    assert body["data"]["change"]["review_comment"] == "accepted"


def test_review_candidate_change_conflict_returns_409(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        project_space_service,
        "review_candidate_change",
        AsyncMock(side_effect=ConflictException("version conflict")),
    )

    resp = client.post(
        f"/api/v1/projects/{_PROJECT_ID}/candidate-changes/c-008/review",
        json={"action": "accept"},
    )
    assert resp.status_code == 409


def test_delete_reference_returns_simple_success(client, monkeypatch, _as_user):
    delete_reference = AsyncMock(return_value=_fake_reference(status="disabled"))
    monkeypatch.setattr(
        project_space_service,
        "delete_project_reference",
        delete_reference,
    )

    resp = client.delete(f"/api/v1/projects/{_PROJECT_ID}/references/r-001")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"] == {}
    delete_reference.assert_awaited_once_with(
        project_id=_PROJECT_ID,
        reference_id="r-001",
        user_id=_USER_ID,
    )


def test_create_project_member_idempotency_hit_returns_cached(
    client, monkeypatch, _as_user
):
    cached = {
        "success": True,
        "data": {
            "member": {
                "id": "m-cached",
                "project_id": _PROJECT_ID,
                "user_id": "u-cached",
                "role": "viewer",
                "permissions": None,
                "status": "active",
                "created_at": _NOW.isoformat(),
            }
        },
        "message": "缓存命中",
    }
    monkeypatch.setattr(
        project_space_service,
        "get_idempotency_response",
        AsyncMock(return_value=cached),
    )
    create_member = AsyncMock(return_value=_fake_member())
    monkeypatch.setattr(project_space_service, "create_project_member", create_member)

    resp = client.post(
        f"/api/v1/projects/{_PROJECT_ID}/members",
        headers={"Idempotency-Key": "00000000-0000-0000-0000-000000000201"},
        json={"user_id": "u-member-001", "role": "editor"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["message"] == "缓存命中"
    assert body["data"]["member"]["id"] == "m-cached"
    create_member.assert_not_awaited()


def test_update_project_member_persists_idempotency(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        project_space_service,
        "get_idempotency_response",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        project_space_service,
        "update_project_member",
        AsyncMock(return_value=_fake_member(member_id="m-007")),
    )
    save_idempotency = AsyncMock(return_value=None)
    monkeypatch.setattr(
        project_space_service,
        "save_idempotency_response",
        save_idempotency,
    )

    resp = client.patch(
        f"/api/v1/projects/{_PROJECT_ID}/members/m-007",
        headers={"Idempotency-Key": "00000000-0000-0000-0000-000000000202"},
        json={"role": "viewer"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["member"]["id"] == "m-007"
    save_idempotency.assert_awaited_once()


def test_delete_project_member_returns_simple_success(client, monkeypatch, _as_user):
    delete_member = AsyncMock(return_value=None)
    monkeypatch.setattr(
        project_space_service,
        "delete_project_member",
        delete_member,
    )

    resp = client.delete(f"/api/v1/projects/{_PROJECT_ID}/members/m-009")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"] == {}
    delete_member.assert_awaited_once_with(
        project_id=_PROJECT_ID,
        member_id="m-009",
        user_id=_USER_ID,
    )
