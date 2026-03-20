from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.library_semantics import SILENT_ACCRETION_USAGE_INTENT
from services.project_space_service import ProjectSpaceService
from services.project_space_service.artifact_semantics import (
    ArtifactMetadataKind,
    ProjectCapability,
    is_artifact_project_visible,
    is_artifact_shared,
    normalize_artifact_visibility,
)


@pytest.mark.asyncio
async def test_create_artifact_summary_outline_sets_metadata(monkeypatch):
    service = ProjectSpaceService()
    create_artifact = AsyncMock(
        return_value=SimpleNamespace(
            id="artifact-002",
            projectId="project-001",
            type="summary",
            storagePath="generated/outline.json",
        )
    )
    service.db = SimpleNamespace(
        create_artifact=create_artifact,
        get_project_version=AsyncMock(return_value=None),
    )

    generate_summary = AsyncMock(return_value="generated/outline.json")
    monkeypatch.setattr(
        "services.project_space_service.artifacts.artifact_generator.generate_summary",
        generate_summary,
    )

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="summary",
        visibility="private",
        user_id="user-001",
        content={"mode": "outline", "title": "课程大纲"},
    )

    payload = generate_summary.await_args.args[0]
    assert payload["kind"] == ArtifactMetadataKind.OUTLINE.value
    assert payload["nodes"] == []
    assert (
        create_artifact.await_args.kwargs["metadata"]["kind"]
        == ArtifactMetadataKind.OUTLINE.value
    )
    assert (
        create_artifact.await_args.kwargs["metadata"]["capability"]
        == ProjectCapability.SUMMARY.value
    )


@pytest.mark.asyncio
async def test_create_artifact_handout_docx_sets_metadata(monkeypatch):
    service = ProjectSpaceService()
    create_artifact = AsyncMock(
        return_value=SimpleNamespace(
            id="artifact-003",
            projectId="project-001",
            type="docx",
            storagePath="generated/handout.docx",
        )
    )
    service.db = SimpleNamespace(
        create_artifact=create_artifact,
        get_project_version=AsyncMock(return_value=None),
    )

    generate_docx = AsyncMock(return_value="generated/handout.docx")
    monkeypatch.setattr(
        "services.project_space_service.artifacts.artifact_generator.generate_docx",
        generate_docx,
    )

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="docx",
        visibility="private",
        user_id="user-001",
        content={"mode": "handout", "title": "教学讲义"},
    )

    payload = generate_docx.await_args.args[0]
    assert payload["kind"] == ArtifactMetadataKind.HANDOUT.value
    assert (
        create_artifact.await_args.kwargs["metadata"]["kind"]
        == ArtifactMetadataKind.HANDOUT.value
    )
    assert (
        create_artifact.await_args.kwargs["metadata"]["capability"]
        == ProjectCapability.WORD.value
    )


@pytest.mark.asyncio
async def test_create_artifact_animation_storyboard_uses_html(monkeypatch):
    service = ProjectSpaceService()
    create_artifact = AsyncMock(
        return_value=SimpleNamespace(
            id="artifact-001",
            projectId="project-001",
            type="html",
            storagePath="generated/storyboard.html",
        )
    )
    service.db = SimpleNamespace(
        create_artifact=create_artifact,
        get_project_version=AsyncMock(return_value=None),
    )

    generate_html = AsyncMock(return_value="generated/storyboard.html")
    monkeypatch.setattr(
        "services.project_space_service.artifacts.artifact_generator.generate_html",
        generate_html,
    )

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="html",
        visibility="private",
        user_id="user-001",
        session_id="session-001",
        content={"mode": "animation_storyboard", "title": "Storyboard"},
    )

    html_content = generate_html.await_args.args[0]
    assert "Storyboard" in html_content
    assert "Scene 1" in html_content
    assert (
        create_artifact.await_args.kwargs["metadata"]["kind"]
        == ArtifactMetadataKind.ANIMATION_STORYBOARD.value
    )
    assert (
        create_artifact.await_args.kwargs["metadata"]["capability"]
        == ProjectCapability.ANIMATION.value
    )


def test_normalize_artifact_visibility_defaults_private():
    assert normalize_artifact_visibility(None).value == "private"


def test_artifact_visibility_helpers_use_formal_vocabulary():
    assert is_artifact_project_visible("project-visible") is True
    assert is_artifact_shared("shared") is True
    assert is_artifact_shared("private") is False


@pytest.mark.asyncio
async def test_create_artifact_silently_accretes_text_into_library(monkeypatch):
    service = ProjectSpaceService()
    artifact = SimpleNamespace(
        id="artifact-004",
        projectId="project-001",
        type="summary",
        storagePath="generated/summary.json",
    )
    create_artifact = AsyncMock(return_value=artifact)
    create_upload = AsyncMock(return_value=SimpleNamespace(id="upload-001"))
    update_file_intent = AsyncMock()
    update_upload_status = AsyncMock()
    create_parsed_chunks = AsyncMock(return_value=[SimpleNamespace(id="chunk-001")])
    service.db = SimpleNamespace(
        create_artifact=create_artifact,
        get_project_version=AsyncMock(return_value=None),
        create_upload=create_upload,
        update_file_intent=update_file_intent,
        update_upload_status=update_upload_status,
        create_parsed_chunks=create_parsed_chunks,
    )

    generate_summary = AsyncMock(return_value="generated/summary.json")
    index_chunks = AsyncMock(return_value=1)
    monkeypatch.setattr(
        "services.project_space_service.artifacts.artifact_generator.generate_summary",
        generate_summary,
    )
    monkeypatch.setattr(
        "services.project_space_service.artifacts.rag_service.index_chunks",
        index_chunks,
    )
    monkeypatch.setattr(
        "services.project_space_service.artifacts.Path.stat",
        lambda self: SimpleNamespace(st_size=128),
    )

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="summary",
        visibility="private",
        user_id="user-001",
        session_id="session-001",
        content={"mode": "outline", "title": "课程大纲", "summary": "讲解牛顿第二定律"},
    )

    update_file_intent.assert_awaited_once_with(
        "upload-001",
        SILENT_ACCRETION_USAGE_INTENT,
    )
    metadata = create_parsed_chunks.await_args.kwargs["chunks"][0]["metadata"]
    assert metadata["artifact_id"] == "artifact-004"
    assert metadata["source_type"] == "ai_generated"
    assert metadata["session_id"] == "session-001"
    parse_result = update_upload_status.await_args.kwargs["parse_result"]
    assert parse_result["silent_accretion"] is True
