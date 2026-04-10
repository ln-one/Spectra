from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from services.generation_session_service import ConflictError, GenerationSessionService
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
        "services.platform.task_recovery.TaskRecoveryService.is_session_already_running",
        AsyncMock(return_value=True),
    )

    with pytest.raises(ConflictError):
        await service.execute_command(
            session_id="s-001",
            user_id="u-001",
            command={"command_type": "CONFIRM_OUTLINE"},
        )


@pytest.mark.anyio
async def test_confirm_outline_normalizes_task_type_for_enqueue(monkeypatch):
    session_before = _fake_session(
        output_type=SessionOutputType.WORD.value,
        options='{"template_config": {"style": "gaia"}}',
    )
    session_after = _fake_session(
        state=GenerationState.GENERATING_CONTENT.value,
        output_type=SessionOutputType.WORD.value,
    )
    created_task = SimpleNamespace(id="task-101")

    db = SimpleNamespace(
        idempotencykey=SimpleNamespace(find_unique=AsyncMock(return_value=None)),
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(side_effect=[session_before, session_after]),
            update=AsyncMock(),
        ),
        generationtask=SimpleNamespace(
            create=AsyncMock(return_value=created_task),
            update=AsyncMock(),
            find_unique=AsyncMock(return_value=SimpleNamespace(inputData=None)),
        ),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )
    service = GenerationSessionService(db=db)

    queue = Mock()
    queue.get_queue_info.return_value = {"workers": {"count": 1, "stale": []}}
    queue.enqueue_generation_task.return_value = SimpleNamespace(id="rq-1")

    monkeypatch.setattr(
        "services.platform.task_recovery.TaskRecoveryService.is_session_already_running",
        AsyncMock(return_value=False),
    )
    monkeypatch.setattr(
        service._guard, "validate", lambda *_: _allow_confirm_transition()
    )

    result = await service.execute_command(
        session_id="s-001",
        user_id="u-001",
        command={"command_type": "CONFIRM_OUTLINE"},
        task_queue_service=queue,
    )

    assert result["warnings"] == []
    assert result["task_id"] == "task-101"
    enqueue_kwargs = queue.enqueue_generation_task.call_args.kwargs
    assert enqueue_kwargs["task_type"] == "docx"
    assert enqueue_kwargs["template_config"] == {"style": "gaia"}


@pytest.mark.anyio
async def test_execute_command_marks_dispatch_failed_when_queue_unavailable(
    monkeypatch,
):
    session_before = _fake_session(output_type=SessionOutputType.PPT.value)
    session_after = _fake_session(
        state=GenerationState.GENERATING_CONTENT.value,
        output_type=SessionOutputType.PPT.value,
    )
    db = SimpleNamespace(
        idempotencykey=SimpleNamespace(find_unique=AsyncMock(return_value=None)),
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(side_effect=[session_before, session_after]),
            update=AsyncMock(),
        ),
        generationtask=SimpleNamespace(update=AsyncMock()),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )
    service = GenerationSessionService(db=db)
    service._dispatch_command = AsyncMock(return_value="task-202")

    monkeypatch.setattr(
        "services.platform.task_recovery.TaskRecoveryService.is_session_already_running",
        AsyncMock(return_value=False),
    )
    monkeypatch.setattr(
        service._guard, "validate", lambda *_: _allow_confirm_transition()
    )

    with pytest.raises(ConflictError):
        await service.execute_command(
            session_id="s-001",
            user_id="u-001",
            command={"command_type": "CONFIRM_OUTLINE"},
            task_queue_service=None,
        )

    state_updates = [
        call.kwargs["data"]
        for call in db.generationsession.update.await_args_list
        if "state" in (call.kwargs.get("data") or {})
    ]
    assert state_updates
    update_payload = state_updates[-1]
    assert update_payload["state"] == GenerationState.FAILED.value


@pytest.mark.anyio
async def test_schedule_outline_draft_task_uses_rq_when_available():
    service = GenerationSessionService(db=SimpleNamespace())
    queue = Mock()
    queue.get_queue_info.return_value = {"workers": {"count": 1}}
    queue.enqueue_outline_draft_task.return_value = SimpleNamespace(id="job-123")

    await service._schedule_outline_draft_task(
        session_id="s-001",
        project_id="p-001",
        options={"pages": 10},
        task_queue_service=queue,
    )

    queue.enqueue_outline_draft_task.assert_called_once()


@pytest.mark.anyio
async def test_schedule_outline_draft_task_raises_when_queue_unavailable():
    service = GenerationSessionService(db=SimpleNamespace())

    with pytest.raises(RuntimeError):
        await service._schedule_outline_draft_task(
            session_id="s-001",
            project_id="p-001",
            options={"pages": 10},
            task_queue_service=None,
        )
