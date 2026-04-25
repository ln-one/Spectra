from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from routers.generate_sessions.candidate_changes import (
    resolve_session_artifact_binding,
)
from utils.exceptions import NotFoundException


@pytest.mark.asyncio
async def test_resolve_session_artifact_binding_keeps_explicit_artifact_for_run(
    monkeypatch,
):
    run = SimpleNamespace(
        id="run-001",
        projectId="project-001",
        sessionId="session-001",
        artifactId=None,
    )
    artifact = SimpleNamespace(
        id="artifact-001",
        projectId="project-001",
        sessionId="session-001",
    )
    get_artifact = AsyncMock(return_value=artifact)
    get_project_artifacts = AsyncMock(
        side_effect=AssertionError("explicit artifact_id should short-circuit")
    )
    monkeypatch.setattr(
        "routers.generate_sessions.candidate_changes.db_service",
        SimpleNamespace(
            db=SimpleNamespace(
                sessionrun=SimpleNamespace(find_unique=AsyncMock(return_value=run))
            )
        ),
    )
    monkeypatch.setattr(
        "routers.generate_sessions.candidate_changes.project_space_service.get_artifact",
        get_artifact,
    )
    monkeypatch.setattr(
        "routers.generate_sessions.candidate_changes.project_space_service.get_project_artifacts",
        get_project_artifacts,
    )

    bound = await resolve_session_artifact_binding(
        project_id="project-001",
        session_id="session-001",
        user_id="user-001",
        artifact_id="artifact-001",
        run_id="run-001",
    )

    assert bound is artifact
    get_artifact.assert_awaited_once_with("artifact-001", user_id="user-001")
    get_project_artifacts.assert_not_awaited()


@pytest.mark.asyncio
async def test_resolve_session_artifact_binding_rejects_explicit_artifact_outside_session(
    monkeypatch,
):
    run = SimpleNamespace(
        id="run-001",
        projectId="project-001",
        sessionId="session-001",
        artifactId=None,
    )
    artifact = SimpleNamespace(
        id="artifact-001",
        projectId="project-001",
        sessionId="session-999",
    )
    monkeypatch.setattr(
        "routers.generate_sessions.candidate_changes.db_service",
        SimpleNamespace(
            db=SimpleNamespace(
                sessionrun=SimpleNamespace(find_unique=AsyncMock(return_value=run))
            )
        ),
    )
    monkeypatch.setattr(
        "routers.generate_sessions.candidate_changes.project_space_service.get_artifact",
        AsyncMock(return_value=artifact),
    )

    with pytest.raises(NotFoundException):
        await resolve_session_artifact_binding(
            project_id="project-001",
            session_id="session-001",
            user_id="user-001",
            artifact_id="artifact-001",
            run_id="run-001",
        )
