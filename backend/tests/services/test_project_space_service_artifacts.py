import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.library_semantics import SILENT_ACCRETION_USAGE_INTENT
from services.project_space_service import ProjectSpaceService
from services.project_space_service.artifact_content import (
    build_artifact_accretion_text,
)
from services.project_space_service.artifact_semantics import (
    ArtifactMetadataKind,
    ProjectCapability,
    is_artifact_project_visible,
    is_artifact_shared,
    normalize_artifact_visibility,
)
from utils.exceptions import ConflictException


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
        get_project_version=AsyncMock(
            return_value=SimpleNamespace(id="version-001", projectId="project-001")
        ),
        get_project=AsyncMock(
            return_value=SimpleNamespace(
                id="project-001", currentVersionId="version-001"
            )
        ),
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
    assert create_artifact.await_args.kwargs["based_on_version_id"] == "version-001"


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
        get_project=AsyncMock(
            return_value=SimpleNamespace(id="project-001", currentVersionId=None)
        ),
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
        get_project=AsyncMock(
            return_value=SimpleNamespace(id="project-001", currentVersionId=None)
        ),
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


@pytest.mark.asyncio
async def test_create_artifact_gif_uses_real_animation_generator(monkeypatch):
    service = ProjectSpaceService()
    create_artifact = AsyncMock(
        return_value=SimpleNamespace(
            id="artifact-gif-001",
            projectId="project-001",
            type="gif",
            storagePath="generated/storyboard.gif",
        )
    )
    service.db = SimpleNamespace(
        create_artifact=create_artifact,
        get_project_version=AsyncMock(return_value=None),
        get_project=AsyncMock(
            return_value=SimpleNamespace(id="project-001", currentVersionId=None)
        ),
    )

    generate_animation = AsyncMock(return_value="generated/storyboard.gif")
    monkeypatch.setattr(
        "services.project_space_service.artifacts.artifact_generator.generate_animation",
        generate_animation,
    )

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="gif",
        visibility="private",
        user_id="user-001",
        content={
            "kind": "animation_storyboard",
            "title": "Storyboard",
            "summary": "Explain the process",
            "topic": "Forces",
            "duration_seconds": 8,
            "rhythm": "balanced",
            "focus": "Highlight transitions",
            "placements": [{"ppt_artifact_id": "ppt-001", "page_number": 2}],
            "scenes": [
                {"title": "起点", "description": "先说明观察对象", "emphasis": "看清起点"},
                {"title": "变化", "description": "突出过程变化", "emphasis": "看清转折"},
            ],
        },
    )

    generate_animation.assert_awaited_once()
    assert (
        create_artifact.await_args.kwargs["storage_path"] == "generated/storyboard.gif"
    )
    metadata = create_artifact.await_args.kwargs["metadata"]
    assert metadata["kind"] == ArtifactMetadataKind.ANIMATION_STORYBOARD.value
    assert metadata["capability"] == ProjectCapability.ANIMATION.value
    assert metadata["format"] == "gif"
    assert metadata["duration_seconds"] == 8
    assert metadata["rhythm"] == "balanced"
    assert metadata["focus"] == "Highlight transitions"
    assert metadata["visual_type"] == "process_flow"
    assert metadata["content_snapshot"]["format"] == "gif"
    assert metadata["content_snapshot"]["scenes"][0]["title"] == "起点"
    assert metadata["content_snapshot"]["render_spec"]["scenes"][1]["title"] == "变化"
    assert metadata["content_snapshot"]["placements"][0]["page_number"] == 2


@pytest.mark.asyncio
async def test_create_artifact_mp4_uses_real_video_generator(monkeypatch):
    service = ProjectSpaceService()
    create_artifact = AsyncMock(
        return_value=SimpleNamespace(
            id="artifact-mp4-001",
            projectId="project-001",
            type="mp4",
            storagePath="generated/storyboard.mp4",
        )
    )
    service.db = SimpleNamespace(
        create_artifact=create_artifact,
        get_project_version=AsyncMock(return_value=None),
        get_project=AsyncMock(
            return_value=SimpleNamespace(id="project-001", currentVersionId=None)
        ),
    )

    generate_video = AsyncMock(return_value="generated/storyboard.mp4")
    monkeypatch.setattr(
        "services.project_space_service.artifacts.artifact_generator.generate_video",
        generate_video,
    )

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="mp4",
        visibility="private",
        user_id="user-001",
        content={"kind": "animation_storyboard", "title": "Storyboard", "scenes": []},
    )

    generate_video.assert_awaited_once()
    assert (
        create_artifact.await_args.kwargs["storage_path"] == "generated/storyboard.mp4"
    )


@pytest.mark.asyncio
async def test_create_summary_artifact_preserves_slides_and_turns(monkeypatch):
    service = ProjectSpaceService()
    create_artifact = AsyncMock(
        return_value=SimpleNamespace(
            id="artifact-010",
            projectId="project-001",
            type="summary",
            storagePath="generated/summary.json",
        )
    )
    service.db = SimpleNamespace(
        create_artifact=create_artifact,
        get_project_version=AsyncMock(return_value=None),
        get_project=AsyncMock(
            return_value=SimpleNamespace(id="project-001", currentVersionId=None)
        ),
    )

    generate_summary = AsyncMock(return_value="generated/summary.json")
    monkeypatch.setattr(
        "services.project_space_service.artifacts.artifact_generator.generate_summary",
        generate_summary,
    )

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="summary",
        visibility="private",
        user_id="user-001",
        content={
            "kind": "speaker_notes",
            "slides": [{"page": 1, "title": "教学目标", "script": "讲稿正文"}],
            "turns": [{"question": "为什么", "teacher_answer": "因为", "score": 80}],
        },
    )

    payload = generate_summary.await_args.args[0]
    assert payload["slides"][0]["script"] == "讲稿正文"
    assert payload["turns"][0]["teacher_answer"] == "因为"


def test_build_artifact_accretion_text_includes_slides_and_turns():
    text = build_artifact_accretion_text(
        "summary",
        {
            "kind": "classroom_qa_simulator",
            "title": "课堂问答模拟",
            "slides": [
                {
                    "page": 1,
                    "title": "第一页",
                    "script": "这一页这样讲。",
                    "transition_line": "接下来进入第二页。",
                }
            ],
            "turns": [
                {
                    "question": "如果条件变化怎么办？",
                    "teacher_answer": "先看边界条件。",
                    "feedback": "回答到位。",
                    "score": 88,
                }
            ],
        },
    )

    assert "讲稿页 1：第一页" in text
    assert "这一页这样讲。" in text
    assert "追问：如果条件变化怎么办？" in text
    assert "评分：88" in text


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
        get_project_version=AsyncMock(
            return_value=SimpleNamespace(id="version-001", projectId="project-001")
        ),
        get_project=AsyncMock(
            return_value=SimpleNamespace(
                id="project-001",
                currentVersionId="version-001",
            )
        ),
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
    assert metadata["source_project_id"] == "project-001"
    assert metadata["artifact_visibility"] == "private"
    assert metadata["based_on_version_id"] == "version-001"
    assert metadata["session_id"] == "session-001"
    parse_result = update_upload_status.await_args.kwargs["parse_result"]
    assert parse_result["source_project_id"] == "project-001"
    assert parse_result["artifact_visibility"] == "private"
    assert parse_result["based_on_version_id"] == "version-001"
    assert parse_result["silent_accretion"] is True


@pytest.mark.asyncio
async def test_create_artifact_preserves_explicit_based_on_version_id(monkeypatch):
    service = ProjectSpaceService()
    create_artifact = AsyncMock(
        return_value=SimpleNamespace(
            id="artifact-005",
            projectId="project-001",
            type="summary",
            storagePath="generated/summary.json",
        )
    )
    service.db = SimpleNamespace(
        create_artifact=create_artifact,
        get_project_version=AsyncMock(
            return_value=SimpleNamespace(id="version-explicit", projectId="project-001")
        ),
        get_project=AsyncMock(
            return_value=SimpleNamespace(
                id="project-001", currentVersionId="version-current"
            )
        ),
    )

    generate_summary = AsyncMock(return_value="generated/summary.json")
    monkeypatch.setattr(
        "services.project_space_service.artifacts.artifact_generator.generate_summary",
        generate_summary,
    )

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="summary",
        visibility="private",
        user_id="user-001",
        based_on_version_id="version-explicit",
        content={"mode": "outline", "title": "课程大纲"},
    )

    assert (
        create_artifact.await_args.kwargs["based_on_version_id"] == "version-explicit"
    )


@pytest.mark.asyncio
async def test_create_artifact_rejects_invalid_current_version_anchor(monkeypatch):
    service = ProjectSpaceService()
    create_artifact = AsyncMock()
    service.db = SimpleNamespace(
        create_artifact=create_artifact,
        get_project_version=AsyncMock(
            side_effect=[
                SimpleNamespace(id="version-other", projectId="project-other"),
            ]
        ),
        get_project=AsyncMock(
            return_value=SimpleNamespace(
                id="project-001",
                currentVersionId="version-other",
            )
        ),
    )

    monkeypatch.setattr(
        "services.project_space_service.artifacts.artifact_generator.generate_summary",
        AsyncMock(return_value="generated/summary.json"),
    )

    with pytest.raises(ConflictException, match="current version anchor is invalid"):
        await service.create_artifact_with_file(
            project_id="project-001",
            artifact_type="summary",
            visibility="private",
            user_id="user-001",
            content={"mode": "outline", "title": "课程大纲"},
        )

    create_artifact.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_artifact_silent_accretion_timeout_is_best_effort(monkeypatch):
    service = ProjectSpaceService()
    artifact = SimpleNamespace(
        id="artifact-timeout",
        projectId="project-001",
        type="summary",
        storagePath="generated/summary.json",
    )
    service.db = SimpleNamespace(
        create_artifact=AsyncMock(return_value=artifact),
        get_project_version=AsyncMock(
            return_value=SimpleNamespace(id="version-001", projectId="project-001")
        ),
        get_project=AsyncMock(
            return_value=SimpleNamespace(
                id="project-001",
                currentVersionId="version-001",
            )
        ),
    )

    monkeypatch.setattr(
        "services.project_space_service.artifacts.artifact_generator.generate_summary",
        AsyncMock(return_value="generated/summary.json"),
    )

    async def _timeout_wait_for(coro, timeout):
        coro.close()
        raise asyncio.TimeoutError

    monkeypatch.setattr(
        "services.project_space_service.artifacts.asyncio.wait_for",
        _timeout_wait_for,
    )
    monkeypatch.setenv("ARTIFACT_SILENT_ACCRETION_TIMEOUT_SECONDS", "0.1")

    created = await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="summary",
        visibility="private",
        user_id="user-001",
        session_id="session-001",
        content={"title": "带超时的摘要"},
    )

    assert created.id == "artifact-timeout"


@pytest.mark.asyncio
async def test_create_artifact_disables_accretion_timeout_with_non_positive_value(
    monkeypatch,
):
    service = ProjectSpaceService()
    artifact = SimpleNamespace(
        id="artifact-no-timeout",
        projectId="project-001",
        type="summary",
        storagePath="generated/summary.json",
    )
    service.db = SimpleNamespace(
        create_artifact=AsyncMock(return_value=artifact),
        get_project_version=AsyncMock(
            return_value=SimpleNamespace(id="version-001", projectId="project-001")
        ),
        get_project=AsyncMock(
            return_value=SimpleNamespace(
                id="project-001",
                currentVersionId="version-001",
            )
        ),
    )

    monkeypatch.setattr(
        "services.project_space_service.artifacts.artifact_generator.generate_summary",
        AsyncMock(return_value="generated/summary.json"),
    )
    accrete_mock = AsyncMock()
    monkeypatch.setattr(
        "services.project_space_service.artifacts._silently_accrete_artifact",
        accrete_mock,
    )
    wait_for_mock = AsyncMock()
    monkeypatch.setattr(
        "services.project_space_service.artifacts.asyncio.wait_for",
        wait_for_mock,
    )
    monkeypatch.setenv("ARTIFACT_SILENT_ACCRETION_TIMEOUT_SECONDS", "0")

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="summary",
        visibility="private",
        user_id="user-001",
        session_id="session-001",
        content={"title": "无超时摘要"},
    )

    accrete_mock.assert_awaited_once()
    wait_for_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_artifact_replace_prefers_current_artifact_over_first_candidate(
    monkeypatch,
):
    service = ProjectSpaceService()
    superseded_artifact = SimpleNamespace(
        id="artifact-old-superseded",
        projectId="project-001",
        type="summary",
        visibility="private",
        sessionId="session-001",
        ownerUserId="user-001",
        metadata='{"created_by":"user-001","mode":"create","is_current":false}',
        basedOnVersionId="version-001",
    )
    current_artifact = SimpleNamespace(
        id="artifact-old-current",
        projectId="project-001",
        type="summary",
        visibility="private",
        sessionId="session-001",
        ownerUserId="user-001",
        metadata='{"created_by":"user-001","mode":"create","is_current":true}',
        basedOnVersionId="version-001",
    )
    new_artifact = SimpleNamespace(
        id="artifact-new-current",
        projectId="project-001",
        type="summary",
        storagePath="generated/summary.json",
    )
    create_artifact = AsyncMock(return_value=new_artifact)
    update_artifact_metadata = AsyncMock()
    service.db = SimpleNamespace(
        create_artifact=create_artifact,
        update_artifact_metadata=update_artifact_metadata,
        get_project_artifacts=AsyncMock(
            return_value=[superseded_artifact, current_artifact]
        ),
        get_project_version=AsyncMock(
            return_value=SimpleNamespace(id="version-001", projectId="project-001")
        ),
        get_project=AsyncMock(
            return_value=SimpleNamespace(
                id="project-001",
                currentVersionId="version-001",
            )
        ),
    )

    monkeypatch.setattr(
        "services.project_space_service.artifacts.artifact_generator.generate_summary",
        AsyncMock(return_value="generated/summary.json"),
    )

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="summary",
        visibility="private",
        user_id="user-001",
        session_id="session-001",
        content={"title": "更新后摘要"},
        artifact_mode="replace",
    )

    assert (
        create_artifact.await_args.kwargs["metadata"]["replaces_artifact_id"]
        == "artifact-old-current"
    )
    assert update_artifact_metadata.await_args.args[0] == "artifact-old-current"


@pytest.mark.asyncio
async def test_create_artifact_replace_prefers_matching_version_anchor(monkeypatch):
    service = ProjectSpaceService()
    current_other_version = SimpleNamespace(
        id="artifact-current-other",
        projectId="project-001",
        type="summary",
        visibility="private",
        sessionId="session-001",
        ownerUserId="user-001",
        metadata='{"created_by":"user-001","mode":"create","is_current":true}',
        basedOnVersionId="version-other",
    )
    current_target_version = SimpleNamespace(
        id="artifact-current-target",
        projectId="project-001",
        type="summary",
        visibility="private",
        sessionId="session-001",
        ownerUserId="user-001",
        metadata='{"created_by":"user-001","mode":"create","is_current":true}',
        basedOnVersionId="version-target",
    )
    new_artifact = SimpleNamespace(
        id="artifact-new-target",
        projectId="project-001",
        type="summary",
        storagePath="generated/summary.json",
    )
    create_artifact = AsyncMock(return_value=new_artifact)
    update_artifact_metadata = AsyncMock()
    service.db = SimpleNamespace(
        create_artifact=create_artifact,
        update_artifact_metadata=update_artifact_metadata,
        get_project_artifacts=AsyncMock(
            return_value=[current_other_version, current_target_version]
        ),
        get_project_version=AsyncMock(
            return_value=SimpleNamespace(id="version-target", projectId="project-001")
        ),
        get_project=AsyncMock(
            return_value=SimpleNamespace(
                id="project-001",
                currentVersionId="version-current",
            )
        ),
    )

    monkeypatch.setattr(
        "services.project_space_service.artifacts.artifact_generator.generate_summary",
        AsyncMock(return_value="generated/summary.json"),
    )

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="summary",
        visibility="private",
        user_id="user-001",
        session_id="session-001",
        based_on_version_id="version-target",
        content={"title": "更新后摘要"},
        artifact_mode="replace",
    )

    assert (
        create_artifact.await_args.kwargs["metadata"]["replaces_artifact_id"]
        == "artifact-current-target"
    )
    assert update_artifact_metadata.await_args.args[0] == "artifact-current-target"


@pytest.mark.asyncio
async def test_create_artifact_replace_marks_replacement_lineage(monkeypatch):
    service = ProjectSpaceService()
    previous_artifact = SimpleNamespace(
        id="artifact-old",
        projectId="project-001",
        type="summary",
        visibility="private",
        sessionId="session-001",
        ownerUserId="user-001",
        metadata='{"created_by":"user-001","mode":"create","is_current":true}',
    )
    new_artifact = SimpleNamespace(
        id="artifact-new",
        projectId="project-001",
        type="summary",
        storagePath="generated/summary.json",
    )
    create_artifact = AsyncMock(return_value=new_artifact)
    update_artifact_metadata = AsyncMock()
    service.db = SimpleNamespace(
        create_artifact=create_artifact,
        update_artifact_metadata=update_artifact_metadata,
        get_project_artifacts=AsyncMock(return_value=[previous_artifact]),
        get_project_version=AsyncMock(
            return_value=SimpleNamespace(id="version-001", projectId="project-001")
        ),
        get_project=AsyncMock(
            return_value=SimpleNamespace(
                id="project-001",
                currentVersionId="version-001",
            )
        ),
    )

    generate_summary = AsyncMock(return_value="generated/summary.json")
    monkeypatch.setattr(
        "services.project_space_service.artifacts.artifact_generator.generate_summary",
        generate_summary,
    )

    await service.create_artifact_with_file(
        project_id="project-001",
        artifact_type="summary",
        visibility="private",
        user_id="user-001",
        session_id="session-001",
        content={"title": "更新后摘要"},
        artifact_mode="replace",
    )

    new_metadata = create_artifact.await_args.kwargs["metadata"]
    assert new_metadata["mode"] == "replace"
    assert new_metadata["replaces_artifact_id"] == "artifact-old"
    assert new_metadata["is_current"] is True

    update_artifact_metadata.assert_awaited_once()
    assert update_artifact_metadata.await_args.args[0] == "artifact-old"
    replaced_metadata = update_artifact_metadata.await_args.args[1]
    assert replaced_metadata["superseded_by_artifact_id"] == "artifact-new"
    assert replaced_metadata["is_current"] is False
