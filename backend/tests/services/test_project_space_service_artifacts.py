from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.project_space_service import ProjectSpaceService


@pytest.mark.asyncio
async def test_create_artifact_pptx_sets_capability_metadata(monkeypatch):
    service = ProjectSpaceService()
    create_artifact = AsyncMock(
        return_value=SimpleNamespace(
            id="artifact-006",
            projectId="project-001",
            type="pptx",
            storagePath="generated/deck.pptx",
        )
    )
    service.db = SimpleNamespace(
        create_artifact=create_artifact,
        get_project_version=AsyncMock(return_value=None),
    )

    generate_pptx = AsyncMock(return_value="generated/deck.pptx")
    monkeypatch.setattr(
        "services.project_space_service.artifact_generator.generate_pptx",
        generate_pptx,
    )

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="pptx",
        visibility="private",
        user_id="user-001",
        content={"title": "课程课件"},
    )

    generate_pptx.assert_awaited_once()
    payload = generate_pptx.await_args.args[0]
    assert payload["title"] == "课程课件"
    create_artifact.assert_awaited_once()
    assert create_artifact.await_args.kwargs["metadata"]["capability"] == "ppt"


@pytest.mark.asyncio
async def test_create_artifact_docx_sets_word_capability_metadata(monkeypatch):
    service = ProjectSpaceService()
    create_artifact = AsyncMock(
        return_value=SimpleNamespace(
            id="artifact-007",
            projectId="project-001",
            type="docx",
            storagePath="generated/word.docx",
        )
    )
    service.db = SimpleNamespace(
        create_artifact=create_artifact,
        get_project_version=AsyncMock(return_value=None),
    )

    generate_docx = AsyncMock(return_value="generated/word.docx")
    monkeypatch.setattr(
        "services.project_space_service.artifact_generator.generate_docx",
        generate_docx,
    )

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="docx",
        visibility="private",
        user_id="user-001",
        content={"title": "课程文稿"},
    )

    generate_docx.assert_awaited_once()
    payload = generate_docx.await_args.args[0]
    assert payload["title"] == "课程文稿"
    create_artifact.assert_awaited_once()
    assert create_artifact.await_args.kwargs["metadata"]["capability"] == "word"


@pytest.mark.asyncio
async def test_create_artifact_summary_sets_capability_metadata(monkeypatch):
    service = ProjectSpaceService()
    create_artifact = AsyncMock(
        return_value=SimpleNamespace(
            id="artifact-008",
            projectId="project-001",
            type="summary",
            storagePath="generated/summary.json",
        )
    )
    service.db = SimpleNamespace(
        create_artifact=create_artifact,
        get_project_version=AsyncMock(return_value=None),
    )

    generate_summary = AsyncMock(return_value="generated/summary.json")
    monkeypatch.setattr(
        "services.project_space_service.artifact_generator.generate_summary",
        generate_summary,
    )

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="summary",
        visibility="private",
        user_id="user-001",
        content={"title": "课程总结"},
    )

    generate_summary.assert_awaited_once()
    payload = generate_summary.await_args.args[0]
    assert payload["title"] == "课程总结"
    create_artifact.assert_awaited_once()
    assert create_artifact.await_args.kwargs["metadata"]["capability"] == "summary"


@pytest.mark.asyncio
async def test_create_artifact_with_animation_storyboard_mode_uses_html_and_metadata(
    monkeypatch,
):
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
    generate_animation = AsyncMock(return_value="generated/placeholder.gif")
    monkeypatch.setattr(
        "services.project_space_service.artifact_generator.generate_html",
        generate_html,
    )
    monkeypatch.setattr(
        "services.project_space_service.artifact_generator.generate_animation",
        generate_animation,
    )

    result = await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="html",
        visibility="private",
        user_id="user-001",
        session_id="session-001",
        content={"mode": "animation_storyboard", "title": "Storyboard"},
    )

    assert result.id == "artifact-001"
    generate_html.assert_awaited_once()
    generate_animation.assert_not_awaited()

    html_content = generate_html.await_args.args[0]
    assert "Storyboard" in html_content
    assert "Scene 1" in html_content

    create_artifact.assert_awaited_once_with(
        project_id="project-001",
        artifact_type="html",
        visibility="private",
        session_id="session-001",
        based_on_version_id=None,
        owner_user_id="user-001",
        storage_path="generated/storyboard.html",
        metadata={
            "created_by": "user-001",
            "kind": "animation_storyboard",
            "capability": "animation",
        },
    )


@pytest.mark.asyncio
async def test_create_artifact_with_outline_mode_sets_summary_metadata(monkeypatch):
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
        "services.project_space_service.artifact_generator.generate_summary",
        generate_summary,
    )

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="summary",
        visibility="private",
        user_id="user-001",
        content={"mode": "outline", "title": "课程大纲"},
    )

    generate_summary.assert_awaited_once()
    payload = generate_summary.await_args.args[0]
    assert payload["title"] == "课程大纲"
    assert payload["kind"] == "outline"
    assert payload["nodes"] == []
    create_artifact.assert_awaited_once()
    assert create_artifact.await_args.kwargs["artifact_type"] == "summary"
    assert create_artifact.await_args.kwargs["metadata"]["kind"] == "outline"
    assert create_artifact.await_args.kwargs["metadata"]["capability"] == "outline"


@pytest.mark.asyncio
async def test_create_artifact_mindmap_sets_capability_metadata(monkeypatch):
    service = ProjectSpaceService()
    create_artifact = AsyncMock(
        return_value=SimpleNamespace(
            id="artifact-004",
            projectId="project-001",
            type="mindmap",
            storagePath="generated/mindmap.json",
        )
    )
    service.db = SimpleNamespace(
        create_artifact=create_artifact,
        get_project_version=AsyncMock(return_value=None),
    )

    generate_mindmap = AsyncMock(return_value="generated/mindmap.json")
    monkeypatch.setattr(
        "services.project_space_service.artifact_generator.generate_mindmap",
        generate_mindmap,
    )

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="mindmap",
        visibility="private",
        user_id="user-001",
        content={"title": "知识导图"},
    )

    generate_mindmap.assert_awaited_once()
    payload = generate_mindmap.await_args.args[0]
    assert payload["title"] == "知识导图"
    create_artifact.assert_awaited_once()
    assert create_artifact.await_args.kwargs["artifact_type"] == "mindmap"
    assert create_artifact.await_args.kwargs["metadata"]["capability"] == "mindmap"


@pytest.mark.asyncio
async def test_create_artifact_quiz_sets_capability_metadata(monkeypatch):
    service = ProjectSpaceService()
    create_artifact = AsyncMock(
        return_value=SimpleNamespace(
            id="artifact-005",
            projectId="project-001",
            type="exercise",
            storagePath="generated/quiz.json",
        )
    )
    service.db = SimpleNamespace(
        create_artifact=create_artifact,
        get_project_version=AsyncMock(return_value=None),
    )

    generate_quiz = AsyncMock(return_value="generated/quiz.json")
    monkeypatch.setattr(
        "services.project_space_service.artifact_generator.generate_quiz",
        generate_quiz,
    )

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="exercise",
        visibility="private",
        user_id="user-001",
        content={"title": "课堂练习"},
    )

    generate_quiz.assert_awaited_once()
    payload = generate_quiz.await_args.args[0]
    assert payload["title"] == "课堂练习"
    create_artifact.assert_awaited_once()
    assert create_artifact.await_args.kwargs["artifact_type"] == "exercise"
    assert create_artifact.await_args.kwargs["metadata"]["capability"] == "quiz"


@pytest.mark.asyncio
async def test_create_artifact_with_handout_mode_sets_docx_metadata(monkeypatch):
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
        "services.project_space_service.artifact_generator.generate_docx",
        generate_docx,
    )

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="docx",
        visibility="private",
        user_id="user-001",
        content={"mode": "handout", "title": "教学讲义"},
    )

    generate_docx.assert_awaited_once()
    payload = generate_docx.await_args.args[0]
    assert payload["kind"] == "handout"
    assert payload["title"] == "教学讲义"
    create_artifact.assert_awaited_once()
    assert create_artifact.await_args.kwargs["artifact_type"] == "docx"
    assert create_artifact.await_args.kwargs["metadata"]["kind"] == "handout"
    assert create_artifact.await_args.kwargs["metadata"]["capability"] == "handout"
