from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from services.generation_session_service import (
    GenerationSessionService,
    _build_outline_requirements,
    _extract_outline_style,
)
from services.generation_session_service.constants import (
    SessionOutputType,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState


def _fake_session(
    *,
    session_id: str = "s-001",
    state: str,
    output_type: str = SessionOutputType.PPT.value,
    options: str | None = None,
    base_version_id: str | None = "ver-001",
):
    return SimpleNamespace(
        id=session_id,
        projectId="p-001",
        userId="u-001",
        baseVersionId=base_version_id,
        state=state,
        stateReason=None,
        progress=0,
        resumable=True,
        updatedAt=datetime.now(timezone.utc),
        renderVersion=0,
        currentOutlineVersion=0,
        outputType=output_type,
        options=options,
        clientSessionId=session_id,
        displayTitle=None,
        displayTitleSource=None,
        pptUrl=None,
        wordUrl=None,
        errorCode=None,
        errorMessage=None,
        errorRetryable=False,
    )


def test_extract_outline_style_from_explicit_option():
    assert _extract_outline_style({"outline_style": "problem"}) == "problem"


def test_build_outline_requirements_keeps_style_and_pages():
    project = SimpleNamespace(name="test course", description="test description")
    text = _build_outline_requirements(
        project,
        {
            "system_prompt_tone": (
                "[outline_style=workshop]\n"
                "Please emphasize hands-on practice"
            ),
            "pages": 12,
        },
    )
    assert "workshop" in text
    assert "12" in text
    assert "Please emphasize hands-on practice" in text


@pytest.mark.anyio
async def test_create_session_reuses_project_current_version_as_base_when_missing():
    existing_session = _fake_session(
        session_id="s-existing",
        state=GenerationState.IDLE.value,
        base_version_id=None,
    )
    updated_session = _fake_session(
        session_id="s-existing",
        state=GenerationState.DRAFTING_OUTLINE.value,
        base_version_id="ver-current-002",
    )
    db = SimpleNamespace(
        project=SimpleNamespace(
            find_unique=AsyncMock(
                return_value=SimpleNamespace(
                    id="p-001", currentVersionId="ver-current-002"
                )
            )
        ),
        generationsession=SimpleNamespace(
            find_first=AsyncMock(return_value=existing_session),
            update=AsyncMock(return_value=updated_session),
        ),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )

    service = GenerationSessionService(db=db)

    session_ref = await service.create_session(
        project_id="p-001",
        user_id="u-001",
        output_type=SessionOutputType.PPT.value,
        client_session_id="s-existing",
        options={"pages": 6},
        bootstrap_only=True,
    )

    assert session_ref["session_id"] == "s-existing"
    assert session_ref["base_version_id"] == "ver-current-002"


@pytest.mark.anyio
async def test_create_session_bootstrap_starts_from_idle_state():
    created_session = _fake_session(
        session_id="s-new",
        state=GenerationState.IDLE.value,
        base_version_id="ver-current-001",
    )
    db = SimpleNamespace(
        project=SimpleNamespace(
            find_unique=AsyncMock(
                return_value=SimpleNamespace(
                    id="p-001", currentVersionId="ver-current-001"
                )
            )
        ),
        generationsession=SimpleNamespace(
            find_first=AsyncMock(return_value=None),
            create=AsyncMock(return_value=created_session),
            update=AsyncMock(),
        ),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )

    service = GenerationSessionService(db=db)

    session_ref = await service.create_session(
        project_id="p-001",
        user_id="u-001",
        output_type=SessionOutputType.PPT.value,
        options={"pages": 10},
        bootstrap_only=True,
    )

    assert session_ref["session_id"] == "s-new"
    event_data = db.sessionevent.create.await_args.kwargs["data"]
    assert event_data["eventType"] == GenerationEventType.STATE_CHANGED.value
    assert event_data["state"] == GenerationState.IDLE.value


@pytest.mark.anyio
async def test_create_session_rejects_non_bootstrap_start():
    db = SimpleNamespace(
        project=SimpleNamespace(find_unique=AsyncMock(return_value=None)),
        generationsession=SimpleNamespace(find_first=AsyncMock(return_value=None)),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )
    service = GenerationSessionService(db=db)

    with pytest.raises(
        RuntimeError,
        match="legacy_non_bootstrap_generation_session_start_removed",
    ):
        await service.create_session(
            project_id="p-001",
            user_id="u-001",
            output_type=SessionOutputType.PPT.value,
            options={"pages": 10},
            bootstrap_only=False,
        )


@pytest.mark.anyio
async def test_get_session_snapshot_includes_grouped_session_artifacts():
    session = _fake_session(state=GenerationState.SUCCESS.value)
    artifacts = [
        SimpleNamespace(
            id="art-outline-001",
            type="summary",
            metadata='{"kind":"outline","is_current":true}',
            basedOnVersionId="ver-002",
            createdAt=datetime.now(timezone.utc),
            updatedAt=datetime.now(timezone.utc),
        ),
        SimpleNamespace(
            id="art-ppt-001",
            type="pptx",
            metadata='{"is_current":false,"superseded_by_artifact_id":"art-ppt-002"}',
            basedOnVersionId="ver-001",
            createdAt=datetime.now(timezone.utc),
            updatedAt=datetime.now(timezone.utc),
        ),
    ]
    db = SimpleNamespace(
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
        artifact=SimpleNamespace(find_many=AsyncMock(return_value=artifacts)),
        candidatechange=SimpleNamespace(find_first=AsyncMock(return_value=None)),
        get_project=AsyncMock(
            return_value=SimpleNamespace(id="p-001", currentVersionId="ver-003")
        ),
    )
    service = GenerationSessionService(db=db)
    service._guard.get_allowed_actions = Mock(return_value=["export"])

    payload = await service.get_session_snapshot(session_id="s-001", user_id="u-001")

    assert payload["artifact_id"] == "art-outline-001"
    assert payload["session_artifact_groups"][0]["items"]
    db.artifact.find_many.assert_awaited_once_with(
        where={"projectId": "p-001", "sessionId": "s-001"},
        order={"updatedAt": "desc"},
    )


@pytest.mark.anyio
async def test_get_session_runtime_state_projects_fields_without_select():
    db = SimpleNamespace(
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(
                return_value=SimpleNamespace(
                    id="s-001",
                    userId="u-001",
                    state="RENDERING",
                    lastCursor="c-101",
                    updatedAt=datetime.now(timezone.utc),
                )
            )
        )
    )
    service = GenerationSessionService(db=db)

    runtime = await service.get_session_runtime_state(
        session_id="s-001",
        user_id="u-001",
    )

    assert runtime["state"] == "RENDERING"
    call_kwargs = db.generationsession.find_unique.await_args.kwargs
    assert call_kwargs["where"] == {"id": "s-001"}
    assert "select" not in call_kwargs
