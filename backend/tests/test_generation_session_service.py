"""Unit tests for GenerationSessionService."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from typing import Optional

import pytest

from services.generation_session_service import ConflictError, GenerationSessionService
from services.state_transition_guard import TransitionResult


def _fake_session(
    state: str = "AWAITING_OUTLINE_CONFIRM",
    output_type: str = "both",
    options: Optional[str] = None,
):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id="s-001",
        projectId="p-001",
        userId="u-001",
        state=state,
        stateReason=None,
        progress=0,
        resumable=True,
        updatedAt=now,
        renderVersion=1,
        currentOutlineVersion=0,
        outputType=output_type,
        options=options,
        outlineVersions=[],
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
        from_state="AWAITING_OUTLINE_CONFIRM",
        to_state="GENERATING_CONTENT",
        command_type="CONFIRM_OUTLINE",
    )


@pytest.mark.asyncio
async def test_execute_command_rejects_when_session_task_is_running(monkeypatch):
    session = _fake_session()
    db = SimpleNamespace(
        idempotencykey=SimpleNamespace(find_unique=AsyncMock(return_value=None)),
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
    )
    service = GenerationSessionService(db=db)

    monkeypatch.setattr(
        "services.task_recovery.TaskRecoveryService.is_session_already_running",
        AsyncMock(return_value=True),
    )

    with pytest.raises(ConflictError, match="执行中的任务"):
        await service.execute_command(
            session_id="s-001",
            user_id="u-001",
            command={"command_type": "CONFIRM_OUTLINE"},
        )


@pytest.mark.asyncio
async def test_execute_command_returns_transition_payload(monkeypatch):
    session_before = _fake_session()
    session_after = _fake_session(state="GENERATING_CONTENT")

    db = SimpleNamespace(
        idempotencykey=SimpleNamespace(
            find_unique=AsyncMock(return_value=None),
            create=AsyncMock(),
        ),
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(side_effect=[session_before, session_after]),
        ),
    )
    service = GenerationSessionService(db=db)
    service._dispatch_command = AsyncMock(return_value=None)

    monkeypatch.setattr(
        "services.task_recovery.TaskRecoveryService.is_session_already_running",
        AsyncMock(return_value=False),
    )
    monkeypatch.setattr(service._guard, "validate", lambda *_: _allow_confirm_transition())

    result = await service.execute_command(
        session_id="s-001",
        user_id="u-001",
        command={"command_type": "CONFIRM_OUTLINE"},
        idempotency_key="idem-1",
    )

    assert result["accepted"] is True
    assert result["transition"]["validated_by"] == "StateTransitionGuard"
    assert result["transition"]["to_state"] == "GENERATING_CONTENT"
    assert result["task_id"] is None
    assert result["session"]["task_id"] is None
    assert result["warnings"] == []
    service._dispatch_command.assert_awaited_once()


@pytest.mark.asyncio
async def test_confirm_outline_normalizes_task_type_for_create_and_enqueue(monkeypatch):
    session_before = _fake_session(
        output_type="word",
        options='{"template_config": {"style": "gaia"}}',
    )
    session_after = _fake_session(state="GENERATING_CONTENT", output_type="word")
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
        ),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )
    service = GenerationSessionService(db=db)

    queue = Mock()
    queue.enqueue_generation_task.return_value = SimpleNamespace(id="rq-1")

    monkeypatch.setattr(
        "services.task_recovery.TaskRecoveryService.is_session_already_running",
        AsyncMock(return_value=False),
    )
    monkeypatch.setattr(service._guard, "validate", lambda *_: _allow_confirm_transition())

    result = await service.execute_command(
        session_id="s-001",
        user_id="u-001",
        command={"command_type": "CONFIRM_OUTLINE"},
        task_queue_service=queue,
    )

    create_kwargs = db.generationtask.create.await_args.kwargs
    assert create_kwargs["data"]["taskType"] == "docx"

    enqueue_kwargs = queue.enqueue_generation_task.call_args.kwargs
    assert enqueue_kwargs["task_type"] == "docx"
    assert enqueue_kwargs["template_config"] == {"style": "gaia"}

    assert result["task_id"] == "task-101"
    assert result["session"]["task_id"] == "task-101"
    assert result["warnings"] == []


@pytest.mark.asyncio
async def test_execute_command_fallbacks_to_local_when_queue_unavailable(monkeypatch):
    session_before = _fake_session(output_type="ppt")
    session_after = _fake_session(state="GENERATING_CONTENT", output_type="ppt")

    db = SimpleNamespace(
        idempotencykey=SimpleNamespace(find_unique=AsyncMock(return_value=None)),
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(side_effect=[session_before, session_after]),
        ),
        generationtask=SimpleNamespace(update=AsyncMock()),
    )
    service = GenerationSessionService(db=db)
    service._dispatch_command = AsyncMock(return_value="task-202")
    service._schedule_local_execution = AsyncMock(return_value=True)

    monkeypatch.setattr(
        "services.task_recovery.TaskRecoveryService.is_session_already_running",
        AsyncMock(return_value=False),
    )
    monkeypatch.setattr(service._guard, "validate", lambda *_: _allow_confirm_transition())

    result = await service.execute_command(
        session_id="s-001",
        user_id="u-001",
        command={"command_type": "CONFIRM_OUTLINE"},
        task_queue_service=None,
    )

    assert result["task_id"] == "task-202"
    assert result["session"]["task_id"] == "task-202"
    assert "task_queue_unavailable_fallback_local_execution" in result["warnings"]


@pytest.mark.asyncio
async def test_execute_command_fallbacks_to_local_when_enqueue_fails(monkeypatch):
    session_before = _fake_session(output_type="ppt")
    session_after = _fake_session(state="GENERATING_CONTENT", output_type="ppt")

    db = SimpleNamespace(
        idempotencykey=SimpleNamespace(find_unique=AsyncMock(return_value=None)),
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(side_effect=[session_before, session_after]),
        ),
        generationtask=SimpleNamespace(update=AsyncMock()),
    )
    service = GenerationSessionService(db=db)
    service._dispatch_command = AsyncMock(return_value="task-303")
    service._schedule_local_execution = AsyncMock(return_value=True)

    queue = Mock()
    queue.enqueue_generation_task.side_effect = RuntimeError("redis down")

    monkeypatch.setattr(
        "services.task_recovery.TaskRecoveryService.is_session_already_running",
        AsyncMock(return_value=False),
    )
    monkeypatch.setattr(service._guard, "validate", lambda *_: _allow_confirm_transition())

    result = await service.execute_command(
        session_id="s-001",
        user_id="u-001",
        command={"command_type": "CONFIRM_OUTLINE"},
        task_queue_service=queue,
    )

    assert result["task_id"] == "task-303"
    assert result["session"]["task_id"] == "task-303"
    assert "task_enqueue_failed_fallback_local_execution" in result["warnings"]
