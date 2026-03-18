from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.project_space_service import ProjectSpaceService


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
