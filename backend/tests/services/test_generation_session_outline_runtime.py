import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from services.generation_session_service import GenerationSessionService
from services.generation_session_service.constants import (
    OutlineGenerationErrorCode,
    OutlineGenerationStateReason,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState


@pytest.mark.anyio
async def test_execute_outline_draft_local_success_path():
    db = SimpleNamespace(
        project=SimpleNamespace(
            find_unique=AsyncMock(
                return_value=SimpleNamespace(
                    id="p-001",
                    name="test-project",
                    description="test-description",
                )
            )
        ),
        outlineversion=SimpleNamespace(create=AsyncMock()),
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(
                return_value={
                    "state": GenerationState.DRAFTING_OUTLINE.value,
                    "currentOutlineVersion": 0,
                }
            ),
            update=AsyncMock(),
        ),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )
    service = GenerationSessionService(db=db)
    mock_outline = SimpleNamespace(
        sections=[
            SimpleNamespace(title="Section 1", key_points=["Point 1"], slide_count=2)
        ]
    )

    with patch("services.generation_session_service.ai_service") as mock_ai:
        mock_ai.generate_outline = AsyncMock(return_value=mock_outline)
        await service._execute_outline_draft_local(
            session_id="s-001",
            project_id="p-001",
            options={"pages": 10},
        )

    event_calls = [
        call.kwargs["data"] for call in db.sessionevent.create.await_args_list
    ]
    assert any(
        event["eventType"] == GenerationEventType.OUTLINE_UPDATED.value
        for event in event_calls
    )
    assert any(
        event["state"] == GenerationState.AWAITING_OUTLINE_CONFIRM.value
        for event in event_calls
    )


@pytest.mark.anyio
async def test_execute_outline_draft_local_failure_path():
    db = SimpleNamespace(
        project=SimpleNamespace(
            find_unique=AsyncMock(
                return_value=SimpleNamespace(
                    id="p-001",
                    name="test-project",
                    description="test-description",
                )
            )
        ),
        outlineversion=SimpleNamespace(create=AsyncMock()),
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(
                side_effect=[
                    {
                        "state": GenerationState.DRAFTING_OUTLINE.value,
                        "currentOutlineVersion": 0,
                    },
                    {
                        "state": GenerationState.DRAFTING_OUTLINE.value,
                        "currentOutlineVersion": 0,
                    },
                ]
            ),
            update=AsyncMock(),
        ),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )
    service = GenerationSessionService(db=db)

    with patch("services.generation_session_service.ai_service") as mock_ai:
        mock_ai.generate_outline = AsyncMock(
            side_effect=Exception("AI service unavailable")
        )
        await service._execute_outline_draft_local(
            session_id="s-001",
            project_id="p-001",
            options={"pages": 10},
        )

    state_updates = [
        call.kwargs["data"]
        for call in db.generationsession.update.await_args_list
        if "state" in (call.kwargs.get("data") or {})
    ]
    assert any(
        update.get("state") == GenerationState.FAILED.value
        and update.get("stateReason") == OutlineGenerationStateReason.FAILED.value
        and update.get("errorCode") == OutlineGenerationErrorCode.FAILED.value
        for update in state_updates
    )


@pytest.mark.anyio
async def test_outline_timeout_emits_stable_timeout_reason():
    db = SimpleNamespace(
        project=SimpleNamespace(find_unique=AsyncMock(return_value=SimpleNamespace())),
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(
                side_effect=[
                    {
                        "state": GenerationState.DRAFTING_OUTLINE.value,
                        "currentOutlineVersion": 0,
                    },
                    {
                        "state": GenerationState.DRAFTING_OUTLINE.value,
                        "currentOutlineVersion": 0,
                    },
                ]
            ),
            update=AsyncMock(),
        ),
        outlineversion=SimpleNamespace(create=AsyncMock()),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )
    service = GenerationSessionService(db=db)

    with patch("services.generation_session_service.ai_service") as mock_ai:
        mock_ai.generate_outline = AsyncMock(side_effect=TimeoutError("provider stuck"))
        await service._execute_outline_draft_local(
            session_id="s-001",
            project_id="p-001",
            options={"pages": 10},
        )

    failed_events = [
        call.kwargs["data"]
        for call in db.sessionevent.create.await_args_list
        if call.kwargs["data"]["eventType"] == GenerationEventType.TASK_FAILED.value
    ]
    payload = json.loads(failed_events[0]["payload"])
    assert payload["error_code"] == OutlineGenerationErrorCode.TIMEOUT.value
