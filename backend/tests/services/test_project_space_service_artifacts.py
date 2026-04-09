from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.project_space_service import ProjectSpaceService


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
