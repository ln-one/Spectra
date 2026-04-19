from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service import (
    ConflictError,
    GenerationSessionService,
)
from services.generation_session_service.constants import (
    SessionOutputType,
)
from services.platform.state_transition_guard import (
    GenerationCommandType,
    GenerationState,
    TransitionResult,
)


def _fake_session(
    state: str = GenerationState.AWAITING_OUTLINE_CONFIRM.value,
    output_type: str = SessionOutputType.BOTH.value,
    options: str | None = None,
):
    return SimpleNamespace(
        id="s-001",
        projectId="p-001",
        userId="u-001",
        baseVersionId="ver-001",
        state=state,
        stateReason=None,
        progress=0,
        resumable=True,
        updatedAt=datetime.now(timezone.utc),
        renderVersion=1,
        currentOutlineVersion=1,
        outputType=output_type,
        options=options,
        outlineVersions=[],
        tasks=[],
        fallbacksJson=None,
        pptUrl=None,
        wordUrl=None,
        errorCode=None,
        errorMessage=None,
        errorRetryable=False,
    )


def _allow_confirm_transition():
    return TransitionResult(
        allowed=True,
        from_state=GenerationState.AWAITING_OUTLINE_CONFIRM.value,
        to_state=GenerationState.GENERATING_CONTENT.value,
        command_type=GenerationCommandType.CONFIRM_OUTLINE.value,
    )


@pytest.mark.anyio
async def test_execute_command_rejects_when_session_task_is_running(monkeypatch):
    session = _fake_session()
    db = SimpleNamespace(
        idempotencykey=SimpleNamespace(find_unique=AsyncMock(return_value=None)),
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
    )
    service = GenerationSessionService(db=db)

    monkeypatch.setattr(
        (
            "services.platform.task_recovery."
            "TaskRecoveryService.is_session_already_running"
        ),
        AsyncMock(return_value=True),
    )

    with pytest.raises(ConflictError):
        await service.execute_command(
            session_id="s-001",
            user_id="u-001",
            command={"command_type": "CONFIRM_OUTLINE"},
        )


@pytest.mark.anyio
async def test_execute_command_confirm_outline_without_diego_binding_conflicts(
    monkeypatch,
):
    session_before = _fake_session(
        output_type=SessionOutputType.PPT.value,
        options="{}",
    )
    db = SimpleNamespace(
        idempotencykey=SimpleNamespace(find_unique=AsyncMock(return_value=None)),
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(return_value=session_before),
            update=AsyncMock(),
        ),
        outlineversion=SimpleNamespace(find_first=AsyncMock(return_value=None)),
        sessionrun=SimpleNamespace(),
    )
    service = GenerationSessionService(db=db)

    monkeypatch.setattr(
        (
            "services.platform.task_recovery."
            "TaskRecoveryService.is_session_already_running"
        ),
        AsyncMock(return_value=False),
    )
    monkeypatch.setattr(
        service._guard, "validate", lambda *_: _allow_confirm_transition()
    )
    monkeypatch.setattr(
        "services.generation_session_service.outline_command_handlers"
        ".get_latest_active_session_run",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "services.generation_session_service.outline_command_handlers"
        ".get_latest_active_session_run_by_tool",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "services.generation_session_service.outline_command_handlers"
        ".create_session_run",
        AsyncMock(
            return_value=SimpleNamespace(
                id="run-101",
                runNo=1,
                title="run-101",
                toolType="ppt_generate",
            )
        ),
    )
    monkeypatch.setattr(
        "services.generation_session_service.outline_command_handlers"
        ".get_session_diego_binding",
        lambda _session: None,
    )

    with pytest.raises(ConflictError) as exc:
        await service.execute_command(
            session_id="s-001",
            user_id="u-001",
            command={"command_type": "CONFIRM_OUTLINE"},
        )
    assert exc.value.details["reason"] == "legacy_ppt_flow_removed"


@pytest.mark.anyio
async def test_execute_command_regenerate_slide_routes_to_diego_runtime(
    monkeypatch,
):
    session = _fake_session(
        state=GenerationState.SUCCESS.value,
        output_type=SessionOutputType.PPT.value,
        options="{}",
    )
    db = SimpleNamespace(
        idempotencykey=SimpleNamespace(find_unique=AsyncMock(return_value=None)),
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
    )
    service = GenerationSessionService(db=db)

    monkeypatch.setattr(
        (
            "services.platform.task_recovery."
            "TaskRecoveryService.is_session_already_running"
        ),
        AsyncMock(return_value=False),
    )
    monkeypatch.setattr(
        service._guard,
        "validate",
        lambda *_: TransitionResult(
            allowed=True,
            from_state=GenerationState.SUCCESS.value,
            to_state=GenerationState.RENDERING.value,
            command_type=GenerationCommandType.REGENERATE_SLIDE.value,
        ),
    )
    monkeypatch.setattr(
        "services.generation_session_service.command_runtime.get_latest_session_run",
        AsyncMock(
            return_value=SimpleNamespace(
                id="run-201",
                sessionId="s-001",
                projectId="p-001",
                toolType="ppt_generate",
                runNo=2,
                title="Run 201",
                titleSource="manual",
                status="processing",
                step="generate",
                artifactId=None,
                createdAt=datetime.now(timezone.utc),
                updatedAt=datetime.now(timezone.utc),
            )
        ),
    )
    monkeypatch.setattr(
        "services.generation_session_service.command_runtime.regenerate_diego_slide_for_run",
        AsyncMock(return_value={"ok": True}),
    )
    monkeypatch.setattr(
        "services.generation_session_service.command_api.request_run_title_generation",
        AsyncMock(return_value=None),
    )
    db.generationsession.update = AsyncMock(return_value=session)
    service._append_event = AsyncMock()
    db.sessionrun = SimpleNamespace(find_first=AsyncMock())

    response = await service.execute_command(
        session_id="s-001",
        user_id="u-001",
        command={
            "command_type": GenerationCommandType.REGENERATE_SLIDE.value,
            "slide_id": "slide-1",
            "slide_index": 1,
            "instruction": "rewrite",
        },
    )

    assert response["accepted"] is True
    assert response["transition"]["command_type"] == "REGENERATE_SLIDE"
