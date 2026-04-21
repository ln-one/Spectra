from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.project_space_service.service import ProjectSpaceService


@pytest.mark.asyncio
async def test_create_artifact_with_file_uses_remote_formal_record(monkeypatch):
    monkeypatch.setenv("OUROGRAPH_BASE_URL", "http://ourograph.test")
    service = ProjectSpaceService()
    service.db = SimpleNamespace(
        create_upload=AsyncMock(),
        update_file_intent=AsyncMock(),
        update_upload_status=AsyncMock(),
        create_parsed_chunks=AsyncMock(return_value=[]),
    )
    monkeypatch.setattr(
        service,
        "get_project_current_version_id",
        AsyncMock(return_value="v-1"),
    )
    monkeypatch.setattr(
        service,
        "get_project_version_with_context",
        AsyncMock(
            side_effect=[
                (SimpleNamespace(id="v-1", projectId="p-1"), "v-1"),
            ]
        ),
    )
    monkeypatch.setattr(
        "services.project_space_service.artifacts.artifact_generator.generate_summary",
        AsyncMock(return_value="generated/summary.json"),
    )
    create_artifact = AsyncMock(
        return_value=SimpleNamespace(
            id="a-1",
            projectId="p-1",
            sessionId=None,
            basedOnVersionId="v-1",
            ownerUserId="u-1",
            type="summary",
            visibility="private",
            storagePath="generated/summary.json",
            metadata='{"kind":"outline"}',
            createdAt="2026-04-09T00:00:00Z",
            updatedAt="2026-04-09T00:00:00Z",
        )
    )
    monkeypatch.setattr(service, "create_artifact", create_artifact)
    monkeypatch.setattr(service, "update_artifact_metadata", AsyncMock())

    artifact = await service.create_artifact_with_file(
        project_id="p-1",
        artifact_type="summary",
        visibility="private",
        user_id="u-1",
        content={"mode": "outline", "title": "课程大纲"},
    )

    assert artifact.id == "a-1"
    create_artifact.assert_awaited_once()
    assert create_artifact.await_args.kwargs["based_on_version_id"] == "v-1"
    assert create_artifact.await_args.kwargs["storage_path"] == "generated/summary.json"
    assert create_artifact.await_args.kwargs["metadata"]["mode"] == "create"
    snapshot = create_artifact.await_args.kwargs["metadata"]["content_snapshot"]
    assert snapshot["mode"] == "outline"
    assert snapshot["title"] == "课程大纲"
    assert snapshot["kind"] == "outline"
    assert snapshot["nodes"] == []


@pytest.mark.asyncio
async def test_create_artifact_with_file_replace_marks_old_artifact(monkeypatch):
    monkeypatch.setenv("OUROGRAPH_BASE_URL", "http://ourograph.test")
    service = ProjectSpaceService()
    service.db = SimpleNamespace()
    monkeypatch.setattr(
        service,
        "get_project_current_version_id",
        AsyncMock(return_value="v-1"),
    )
    monkeypatch.setattr(
        service,
        "get_project_version_with_context",
        AsyncMock(return_value=(SimpleNamespace(id="v-1", projectId="p-1"), "v-1")),
    )
    monkeypatch.setattr(
        service,
        "get_project_artifacts",
        AsyncMock(
            return_value=[
                SimpleNamespace(
                    id="a-old",
                    basedOnVersionId="v-1",
                    metadata='{"is_current": true}',
                )
            ]
        ),
    )
    monkeypatch.setattr(
        "services.project_space_service.artifacts.artifact_generator.generate_summary",
        AsyncMock(return_value="generated/new-summary.json"),
    )
    monkeypatch.setattr(
        service,
        "create_artifact",
        AsyncMock(
            return_value=SimpleNamespace(
                id="a-new",
                projectId="p-1",
                sessionId=None,
                basedOnVersionId="v-1",
                ownerUserId="u-1",
                type="summary",
                visibility="private",
                storagePath="generated/new-summary.json",
                metadata="{}",
                createdAt="2026-04-09T00:00:00Z",
                updatedAt="2026-04-09T00:00:00Z",
            )
        ),
    )
    update_metadata = AsyncMock()
    monkeypatch.setattr(service, "update_artifact_metadata", update_metadata)

    await service.create_artifact_with_file(
        project_id="p-1",
        artifact_type="summary",
        visibility="private",
        user_id="u-1",
        content={"title": "New"},
        artifact_mode="replace",
    )

    update_metadata.assert_awaited_once()
    assert update_metadata.await_args.args[0] == "a-old"
    assert update_metadata.await_args.args[1]["is_current"] is False
    assert update_metadata.await_args.args[1]["superseded_by_artifact_id"] == "a-new"


@pytest.mark.asyncio
async def test_create_artifact_with_file_reuses_authority_office_artifact(
    monkeypatch,
):
    monkeypatch.setenv("OUROGRAPH_BASE_URL", "http://ourograph.test")
    service = ProjectSpaceService()
    service.db = SimpleNamespace()
    monkeypatch.setattr(
        service,
        "get_project_current_version_id",
        AsyncMock(return_value="v-1"),
    )
    monkeypatch.setattr(
        service,
        "get_project_version_with_context",
        AsyncMock(return_value=(SimpleNamespace(id="v-1", projectId="p-1"), "v-1")),
    )
    monkeypatch.setattr(
        service,
        "get_artifact",
        AsyncMock(
            return_value=SimpleNamespace(
                id="a-source",
                type="pptx",
                storagePath="/formal/demo.pptx",
            )
        ),
    )
    invoke_render_mock = AsyncMock(
        side_effect=AssertionError("legacy render job should not run")
    )
    monkeypatch.setattr(
        "services.project_space_service.artifact_rendering.invoke_render_engine",
        invoke_render_mock,
    )
    create_artifact = AsyncMock(
        return_value=SimpleNamespace(
            id="a-new",
            projectId="p-1",
            sessionId=None,
            basedOnVersionId="v-1",
            ownerUserId="u-1",
            type="pptx",
            visibility="private",
            storagePath="/formal/demo.pptx",
            metadata="{}",
            createdAt="2026-04-09T00:00:00Z",
            updatedAt="2026-04-09T00:00:00Z",
        )
    )
    monkeypatch.setattr(service, "create_artifact", create_artifact)
    monkeypatch.setattr(service, "update_artifact_metadata", AsyncMock())

    artifact = await service.create_artifact_with_file(
        project_id="p-1",
        artifact_type="pptx",
        visibility="private",
        user_id="u-1",
        content={"title": "Authority Deck", "source_artifact_id": "a-source"},
    )

    assert artifact.id == "a-new"
    assert create_artifact.await_args.kwargs["storage_path"] == "/formal/demo.pptx"
    invoke_render_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_artifact_with_file_stores_structured_snapshot_for_docx(
    monkeypatch,
):
    monkeypatch.setenv("OUROGRAPH_BASE_URL", "http://ourograph.test")
    service = ProjectSpaceService()
    service.db = SimpleNamespace()
    monkeypatch.setattr(
        service,
        "get_project_current_version_id",
        AsyncMock(return_value="v-1"),
    )
    monkeypatch.setattr(
        service,
        "get_project_version_with_context",
        AsyncMock(return_value=(SimpleNamespace(id="v-1", projectId="p-1"), "v-1")),
    )
    monkeypatch.setattr(
        "services.project_space_service.artifacts.generate_office_artifact_via_render_service",
        AsyncMock(return_value="generated/lesson.docx"),
    )
    create_artifact = AsyncMock(
        return_value=SimpleNamespace(
            id="a-docx",
            projectId="p-1",
            sessionId=None,
            basedOnVersionId="v-1",
            ownerUserId="u-1",
            type="docx",
            visibility="private",
            storagePath="generated/lesson.docx",
            metadata="{}",
            createdAt="2026-04-09T00:00:00Z",
            updatedAt="2026-04-09T00:00:00Z",
        )
    )
    monkeypatch.setattr(service, "create_artifact", create_artifact)
    monkeypatch.setattr(service, "update_artifact_metadata", AsyncMock())

    await service.create_artifact_with_file(
        project_id="p-1",
        artifact_type="docx",
        visibility="private",
        user_id="u-1",
        content={
            "title": "牛顿第一定律教案",
            "document_content": {"type": "doc", "content": []},
            "source_artifact_id": "a-ppt-001",
        },
    )

    snapshot = create_artifact.await_args.kwargs["metadata"]["content_snapshot"]
    assert snapshot["title"] == "牛顿第一定律教案"
    assert snapshot["source_artifact_id"] == "a-ppt-001"
    assert snapshot["document_content"] == {"type": "doc", "content": []}


@pytest.mark.asyncio
async def test_update_artifact_with_file_syncs_metadata_title_from_docx_content(
    monkeypatch,
):
    monkeypatch.setenv("OUROGRAPH_BASE_URL", "http://ourograph.test")
    service = ProjectSpaceService()
    service.db = SimpleNamespace()
    artifact = SimpleNamespace(
        id="a-docx",
        projectId="p-1",
        sessionId=None,
        basedOnVersionId="v-1",
        type="docx",
        visibility="private",
        storagePath="generated/lesson.docx",
        metadata='{"title":"未命名文档"}',
    )
    updated_artifact = SimpleNamespace(
        id="a-docx",
        projectId="p-1",
        sessionId=None,
        basedOnVersionId="v-1",
        type="docx",
        visibility="private",
        storagePath="generated/lesson.docx",
        metadata="{}",
    )
    monkeypatch.setattr(
        "services.project_space_service.artifacts.resolve_based_on_version_id",
        AsyncMock(return_value="v-1"),
    )
    monkeypatch.setattr(
        "services.project_space_service.artifacts._generate_artifact_file",
        AsyncMock(return_value="generated/lesson.docx"),
    )
    monkeypatch.setattr(
        "services.project_space_service.artifacts.silently_accrete_artifact",
        AsyncMock(return_value=None),
    )
    update_metadata = AsyncMock(return_value=updated_artifact)
    monkeypatch.setattr(service, "update_artifact_metadata", update_metadata)
    monkeypatch.setattr(service, "bind_artifact_to_version", AsyncMock())

    await service.update_artifact_with_file(
        artifact=artifact,
        project_id="p-1",
        user_id="u-1",
        content={
            "title": "计算机网络：物理层教案",
            "document_content": {"type": "doc", "content": []},
        },
    )

    assert update_metadata.await_args.args[1]["title"] == "计算机网络：物理层教案"
