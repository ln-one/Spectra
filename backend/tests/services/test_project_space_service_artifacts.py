from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.project_space_service import ProjectSpaceService


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
    assert payload["kind"] == "outline"
    assert payload["nodes"] == []
    assert create_artifact.await_args.kwargs["metadata"]["kind"] == "outline"
    assert create_artifact.await_args.kwargs["metadata"]["capability"] == "summary"


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
    assert payload["kind"] == "handout"
    assert create_artifact.await_args.kwargs["metadata"]["kind"] == "handout"
    assert create_artifact.await_args.kwargs["metadata"]["capability"] == "word"


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
        create_artifact.await_args.kwargs["metadata"]["kind"] == "animation_storyboard"
    )
    assert create_artifact.await_args.kwargs["metadata"]["capability"] == "animation"
