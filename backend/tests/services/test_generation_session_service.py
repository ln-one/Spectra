"""Unit tests for GenerationSessionService."""

import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Optional
from unittest.mock import AsyncMock, Mock, patch

import pytest

from services.generation_session_service import (
    ConflictError,
    GenerationSessionService,
    _build_outline_requirements,
    _extract_outline_style,
)
from services.generation_session_service.command_handlers import handle_update_outline
from services.generation_session_service.constants import (
    OutlineGenerationErrorCode,
    OutlineGenerationStateReason,
    SessionLifecycleReason,
    SessionOutputType,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import (
    GenerationCommandType,
    GenerationState,
    TransitionResult,
)


def _fake_session(
    state: str = GenerationState.AWAITING_OUTLINE_CONFIRM.value,
    output_type: str = SessionOutputType.BOTH.value,
    options: Optional[str] = None,
    base_version_id: Optional[str] = "ver-001",
):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id="s-001",
        projectId="p-001",
        userId="u-001",
        baseVersionId=base_version_id,
        state=state,
        stateReason=None,
        progress=0,
        resumable=True,
        updatedAt=now,
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


def _allow_redraft_transition():
    return TransitionResult(
        allowed=True,
        from_state=GenerationState.AWAITING_OUTLINE_CONFIRM.value,
        to_state=GenerationState.DRAFTING_OUTLINE.value,
        command_type=GenerationCommandType.REDRAFT_OUTLINE.value,
    )


def _fake_artifact(
    artifact_id: str,
    artifact_type: str,
    *,
    metadata: Optional[str] = None,
    based_on_version_id: Optional[str] = None,
):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=artifact_id,
        type=artifact_type,
        metadata=metadata,
        basedOnVersionId=based_on_version_id,
        createdAt=now,
        updatedAt=now,
    )


def test_extract_outline_style_from_explicit_option():
    style = _extract_outline_style({"outline_style": "problem"})
    assert style == "problem"


def test_extract_outline_style_from_system_prompt_token():
    style = _extract_outline_style(
        {
            "system_prompt_tone": "course topic\n[outline_style=story]\nextra requirements"
        }
    )
    assert style == "story"


def test_build_outline_requirements_includes_style_hard_constraints():
    project = SimpleNamespace(name="test course", description="test description")
    text = _build_outline_requirements(
        project,
        {
            "system_prompt_tone": "[outline_style=workshop]\nPlease emphasize hands-on practice",
            "pages": 12,
        },
    )
    assert "workshop" in text
    assert "12" in text
    assert "Please emphasize hands-on practice" in text


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

    with pytest.raises(ConflictError) as exc_info:
        await service.execute_command(
            session_id="s-001",
            user_id="u-001",
            command={"command_type": "CONFIRM_OUTLINE"},
        )
    assert "执行中的任务" in str(exc_info.value)


@pytest.mark.anyio
async def test_execute_command_returns_transition_payload(monkeypatch):
    session_before = _fake_session()
    session_after = _fake_session(state=GenerationState.GENERATING_CONTENT.value)

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
        idempotency_key="idem-1",
    )

    assert result["accepted"] is True
    assert result["transition"]["validated_by"] == "StateTransitionGuard"
    assert result["transition"]["to_state"] == GenerationState.GENERATING_CONTENT.value
    assert result["task_id"] is None
    assert result["session"]["task_id"] is None
    assert result["warnings"] == []
    service._dispatch_command.assert_awaited_once()


@pytest.mark.anyio
async def test_execute_command_redraft_schedules_outline_draft(monkeypatch):
    session_before = _fake_session(
        state=GenerationState.AWAITING_OUTLINE_CONFIRM.value,
        options='{"pages": 12, "outline_style": "structured"}',
    )
    session_after = _fake_session(
        state=GenerationState.DRAFTING_OUTLINE.value,
        options='{"pages": 12, "outline_style": "structured"}',
    )

    db = SimpleNamespace(
        idempotencykey=SimpleNamespace(find_unique=AsyncMock(return_value=None)),
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(side_effect=[session_before, session_after]),
        ),
    )
    service = GenerationSessionService(db=db)
    service._dispatch_command = AsyncMock(return_value=None)
    service._schedule_outline_draft_task = AsyncMock()

    monkeypatch.setattr(
        "services.platform.task_recovery.TaskRecoveryService.is_session_already_running",
        AsyncMock(return_value=False),
    )
    monkeypatch.setattr(
        service._guard, "validate", lambda *_: _allow_redraft_transition()
    )

    await service.execute_command(
        session_id="s-001",
        user_id="u-001",
        command={
            "command_type": GenerationCommandType.REDRAFT_OUTLINE.value,
            "instruction": "请突出互动提问与板书逻辑",
            "base_version": 1,
        },
        task_queue_service=SimpleNamespace(name="queue"),
    )

    service._schedule_outline_draft_task.assert_awaited_once()
    call_kwargs = service._schedule_outline_draft_task.await_args.kwargs
    assert call_kwargs["session_id"] == "s-001"
    assert call_kwargs["project_id"] == "p-001"
    assert call_kwargs["options"]["pages"] == 12
    assert call_kwargs["options"]["outline_style"] == "structured"
    assert (
        call_kwargs["options"]["outline_redraft_instruction"]
        == "请突出互动提问与板书逻辑"
    )


@pytest.mark.anyio
async def test_confirm_outline_normalizes_task_type_for_create_and_enqueue(monkeypatch):
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

    create_kwargs = db.generationtask.create.await_args.kwargs
    assert create_kwargs["data"]["taskType"] == "docx"

    enqueue_kwargs = queue.enqueue_generation_task.call_args.kwargs
    assert enqueue_kwargs["task_type"] == "docx"
    assert enqueue_kwargs["template_config"] == {"style": "gaia"}

    assert result["task_id"] == "task-101"
    assert result["session"]["task_id"] == "task-101"
    assert result["warnings"] == []

    state_updates = [
        call.kwargs["data"]
        for call in db.generationsession.update.await_args_list
        if "state" in (call.kwargs.get("data") or {})
    ]
    assert any(
        update.get("state") == GenerationState.GENERATING_CONTENT.value
        and update.get("stateReason") == SessionLifecycleReason.OUTLINE_CONFIRMED.value
        and update.get("errorCode") is None
        and update.get("errorMessage") is None
        and update.get("errorRetryable") is False
        for update in state_updates
    )

    event_calls = [
        call.kwargs["data"] for call in db.sessionevent.create.await_args_list
    ]
    assert any(
        event.get("state") == GenerationState.GENERATING_CONTENT.value
        and event.get("stateReason") == SessionLifecycleReason.OUTLINE_CONFIRMED.value
        for event in event_calls
    )
    assert any(
        json.loads(event.get("payload") or "{}").get("dispatch") == "rq"
        and event.get("stateReason") == SessionLifecycleReason.OUTLINE_CONFIRMED.value
        for event in event_calls
    )
    assert any(
        json.loads(event.get("payload") or "{}").get("dispatch") == "rq"
        and json.loads(event.get("payload") or "{}").get("rq_job_id") == "rq-1"
        for event in event_calls
    )


@pytest.mark.anyio
async def test_confirm_outline_persists_traceability_fields_in_task_input(monkeypatch):
    session_before = _fake_session(
        output_type=SessionOutputType.PPT.value,
        options='{"template_config": {"style": "gaia", "rag_source_ids": ["file-1"]}}',
    )
    session_after = _fake_session(
        state=GenerationState.GENERATING_CONTENT.value,
        output_type=SessionOutputType.PPT.value,
    )
    created_task = SimpleNamespace(id="task-201")

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
    queue.get_queue_info.return_value = {"workers": {"count": 1, "stale": []}}
    queue.enqueue_generation_task.return_value = SimpleNamespace(id="rq-201")

    monkeypatch.setattr(
        "services.platform.task_recovery.TaskRecoveryService.is_session_already_running",
        AsyncMock(return_value=False),
    )
    monkeypatch.setattr(
        service._guard, "validate", lambda *_: _allow_confirm_transition()
    )

    await service.execute_command(
        session_id="s-001",
        user_id="u-001",
        command={"command_type": "CONFIRM_OUTLINE"},
        task_queue_service=queue,
    )

    raw_input = db.generationtask.create.await_args.kwargs["data"]["inputData"]
    payload = json.loads(raw_input)
    assert payload["retrieval_mode"] == "strict_sources"
    assert payload["policy_version"] == "prompt-policy-v2026-03-28"
    assert payload["baseline_id"] == "prompt-baseline-v1"


@pytest.mark.anyio
async def test_execute_command_fallbacks_to_local_when_queue_unavailable(monkeypatch):
    session_before = _fake_session(output_type=SessionOutputType.PPT.value)
    session_after = _fake_session(
        state=GenerationState.GENERATING_CONTENT.value,
        output_type=SessionOutputType.PPT.value,
    )

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
        task_queue_service=None,
    )

    assert result["task_id"] == "task-202"
    assert result["session"]["task_id"] == "task-202"
    assert "task_queue_unavailable_fallback_local_execution" in result["warnings"]


@pytest.mark.anyio
async def test_execute_command_fallbacks_to_local_when_enqueue_fails(monkeypatch):
    session_before = _fake_session(output_type=SessionOutputType.PPT.value)
    session_after = _fake_session(
        state=GenerationState.GENERATING_CONTENT.value,
        output_type=SessionOutputType.PPT.value,
    )

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
    queue.get_queue_info.return_value = {"workers": {"count": 1, "stale": []}}
    queue.enqueue_generation_task.side_effect = RuntimeError("redis down")

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

    assert result["task_id"] == "task-303"
    assert result["session"]["task_id"] == "task-303"
    assert "task_enqueue_failed_fallback_local_execution" in result["warnings"]


@pytest.mark.anyio
async def test_get_events_ignores_cursor_from_other_session():
    session = _fake_session(state="ANALYZING")
    now = datetime.now(timezone.utc)
    pivot = SimpleNamespace(createdAt=now, sessionId="s-other")
    event = SimpleNamespace(
        id="e-001",
        schemaVersion=1,
        eventType=GenerationEventType.STATE_CHANGED.value,
        state="ANALYZING",
        stateReason=None,
        progress=20,
        createdAt=now,
        cursor="c-001",
        payload="{}",
    )

    db = SimpleNamespace(
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
        sessionevent=SimpleNamespace(
            find_unique=AsyncMock(return_value=pivot),
            find_many=AsyncMock(return_value=[event]),
        ),
    )
    service = GenerationSessionService(db=db)

    events = await service.get_events(
        session_id="s-001",
        user_id="u-001",
        cursor="cursor-from-other-session",
    )

    where_arg = db.sessionevent.find_many.await_args.kwargs["where"]
    assert "createdAt" not in where_arg
    assert events[0]["event_id"] == "e-001"


@pytest.mark.anyio
async def test_get_session_snapshot_uses_guard_public_allowed_actions():
    session = _fake_session(state=GenerationState.SUCCESS.value)
    db = SimpleNamespace(
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
    )
    service = GenerationSessionService(db=db)
    service._guard.get_allowed_actions = Mock(return_value=["export"])

    payload = await service.get_session_snapshot(session_id="s-001", user_id="u-001")

    assert payload["allowed_actions"] == ["export"]
    service._guard.get_allowed_actions.assert_called_once_with(
        GenerationState.SUCCESS.value
    )


@pytest.mark.anyio
async def test_get_session_snapshot_includes_grouped_session_artifacts():
    session = _fake_session(state=GenerationState.SUCCESS.value)
    artifacts = [
        _fake_artifact(
            artifact_id="art-outline-001",
            artifact_type="summary",
            metadata='{"kind":"outline","is_current":true}',
            based_on_version_id="ver-002",
        ),
        _fake_artifact(
            artifact_id="art-ppt-001",
            artifact_type="pptx",
            metadata='{"is_current":false,"superseded_by_artifact_id":"art-ppt-002"}',
            based_on_version_id="ver-001",
        ),
        _fake_artifact(
            artifact_id="art-summary-001",
            artifact_type="summary",
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

    assert len(payload["session_artifacts"]) == 3
    assert payload["artifact_id"] == "art-outline-001"
    assert payload["based_on_version_id"] == "ver-002"
    assert payload["current_version_id"] == "ver-003"
    assert payload["upstream_updated"] is True
    assert payload["artifact_anchor"] == {
        "session_id": "s-001",
        "artifact_id": "art-outline-001",
        "based_on_version_id": "ver-002",
    }
    assert payload["session_artifacts"][0]["artifact_id"] == "art-outline-001"
    assert payload["session_artifacts"][0]["capability"] == "outline"
    assert payload["session_artifacts"][0]["based_on_version_id"] == "ver-002"
    assert payload["session_artifacts"][0]["current_version_id"] == "ver-003"
    assert payload["session_artifacts"][0]["upstream_updated"] is True
    assert payload["session_artifacts"][0]["is_current"] is True
    assert payload["session_artifacts"][0]["title"] == "outline-art-outl"
    ppt_item = next(
        item
        for item in payload["session_artifacts"]
        if item["artifact_id"] == "art-ppt-001"
    )
    assert ppt_item["is_current"] is False
    assert ppt_item["superseded_by_artifact_id"] == "art-ppt-002"

    group_map = {
        group["capability"]: group["items"]
        for group in payload["session_artifact_groups"]
    }
    assert set(group_map.keys()) == {"outline", "ppt", "summary"}
    assert group_map["outline"][0]["artifact_id"] == "art-outline-001"
    assert group_map["ppt"][0]["artifact_id"] == "art-ppt-001"
    assert group_map["ppt"][0]["is_current"] is False
    assert group_map["summary"][0]["artifact_id"] == "art-summary-001"

    db.artifact.find_many.assert_awaited_once_with(
        where={"projectId": "p-001", "sessionId": "s-001"},
        order={"updatedAt": "desc"},
        select={
            "id": True,
            "type": True,
            "basedOnVersionId": True,
            "metadata": True,
            "createdAt": True,
            "updatedAt": True,
        },
    )


@pytest.mark.anyio
async def test_get_session_snapshot_prefers_latest_current_artifact_for_anchor():
    session = _fake_session(state=GenerationState.SUCCESS.value)
    now = datetime.now(timezone.utc)
    artifacts = [
        SimpleNamespace(
            id="art-current-old",
            type="pptx",
            metadata='{"is_current":true}',
            basedOnVersionId="ver-001",
            createdAt=now,
            updatedAt=now,
        ),
        SimpleNamespace(
            id="art-current-new",
            type="pptx",
            metadata='{"is_current":true}',
            basedOnVersionId="ver-002",
            createdAt=now,
            updatedAt=now + timedelta(microseconds=1),
        ),
        SimpleNamespace(
            id="art-superseded-newest",
            type="pptx",
            metadata='{"is_current":false,"superseded_by_artifact_id":"art-current-new"}',
            basedOnVersionId="ver-003",
            createdAt=now,
            updatedAt=now + timedelta(microseconds=2),
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

    assert payload["artifact_id"] == "art-current-new"
    assert payload["artifact_anchor"] == {
        "session_id": "s-001",
        "artifact_id": "art-current-new",
        "based_on_version_id": "ver-002",
    }
    assert payload["session_artifacts"][0]["artifact_id"] == "art-current-new"
    assert payload["session_artifacts"][0]["is_current"] is True


@pytest.mark.anyio
async def test_get_session_snapshot_handles_missing_artifact_model():
    session = _fake_session(state=GenerationState.SUCCESS.value)
    db = SimpleNamespace(
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
        get_project=AsyncMock(
            return_value=SimpleNamespace(id="p-001", currentVersionId="ver-003")
        ),
    )
    service = GenerationSessionService(db=db)
    service._guard.get_allowed_actions = Mock(return_value=["export"])

    payload = await service.get_session_snapshot(session_id="s-001", user_id="u-001")

    assert payload["artifact_id"] is None
    assert payload["based_on_version_id"] is None
    assert payload["current_version_id"] is None
    assert payload["upstream_updated"] is False
    assert payload["artifact_anchor"] == {
        "session_id": "s-001",
        "artifact_id": None,
        "based_on_version_id": None,
    }
    assert payload["session_artifacts"] == []
    assert payload["session_artifact_groups"] == []


@pytest.mark.anyio
async def test_get_session_snapshot_rejects_state_event_mismatch():
    session = _fake_session(state=GenerationState.SUCCESS.value)
    session.stateReason = "task_completed"
    db = SimpleNamespace(
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
        sessionevent=SimpleNamespace(
            find_first=AsyncMock(
                return_value=SimpleNamespace(
                    state=GenerationState.FAILED.value,
                    stateReason="task_failed",
                )
            )
        ),
    )
    service = GenerationSessionService(db=db)
    service._guard.get_allowed_actions = Mock(return_value=["export"])

    with pytest.raises(ConflictError) as exc_info:
        await service.get_session_snapshot(session_id="s-001", user_id="u-001")

    assert exc_info.value.error_code == "RESOURCE_CONFLICT"
    assert exc_info.value.details["reason"] == "state_event_mismatch"
    assert exc_info.value.details["session_state"] == GenerationState.SUCCESS.value
    assert exc_info.value.details["event_state"] == GenerationState.FAILED.value


@pytest.mark.anyio
async def test_get_session_snapshot_with_run_scope_ignores_other_run_state_events():
    session = _fake_session(state=GenerationState.SUCCESS.value)
    session.stateReason = "task_completed"
    now = datetime.now(timezone.utc)
    db = SimpleNamespace(
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
        sessionevent=SimpleNamespace(
            find_first=AsyncMock(return_value=None),
            find_many=AsyncMock(
                return_value=[
                    SimpleNamespace(
                        state=GenerationState.FAILED.value,
                        stateReason="task_failed",
                        payload='{"run_id":"run-other"}',
                    )
                ]
            ),
        ),
        sessionrun=SimpleNamespace(
            find_unique=AsyncMock(
                return_value=SimpleNamespace(
                    id="run-001",
                    sessionId="s-001",
                    projectId="p-001",
                    toolType="ppt_generate",
                    runNo=1,
                    title="第1次PPT生成",
                    titleSource="pending",
                    status="processing",
                    step="generate",
                    artifactId=None,
                    createdAt=now,
                    updatedAt=now,
                )
            )
        ),
    )
    service = GenerationSessionService(db=db)
    service._guard.get_allowed_actions = Mock(return_value=["export"])

    payload = await service.get_session_snapshot(
        session_id="s-001",
        user_id="u-001",
        run_id="run-001",
    )

    assert payload["session"]["state"] == GenerationState.SUCCESS.value
    assert payload["current_run"]["run_id"] == "run-001"
    db.sessionevent.find_many.assert_awaited_once()


@pytest.mark.anyio
async def test_get_session_snapshot_rejects_inconsistent_artifact_anchor():
    session = _fake_session(state=GenerationState.SUCCESS.value)
    db = SimpleNamespace(
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
        sessionevent=SimpleNamespace(find_first=AsyncMock(return_value=None)),
    )
    service = GenerationSessionService(db=db)
    service._guard.get_allowed_actions = Mock(return_value=["export"])

    with patch(
        "services.generation_session_service.queries.get_session_artifact_history",
        AsyncMock(
            return_value={
                "session_artifacts": [
                    {
                        "artifact_id": "a-001",
                        "based_on_version_id": "ver-001",
                    }
                ],
                "session_artifact_groups": [],
                "artifact_id": "a-999",
                "based_on_version_id": "ver-999",
                "current_version_id": None,
                "upstream_updated": False,
                "artifact_anchor": {
                    "session_id": "s-001",
                    "artifact_id": "a-001",
                    "based_on_version_id": "ver-001",
                },
            }
        ),
    ):
        with pytest.raises(ConflictError) as exc_info:
            await service.get_session_snapshot(session_id="s-001", user_id="u-001")

    assert exc_info.value.error_code == "RESOURCE_CONFLICT"
    assert exc_info.value.details["reason"] == "artifact_anchor_mismatch"


@pytest.mark.anyio
async def test_get_session_snapshot_fallbacks_when_artifact_select_not_supported():
    session = _fake_session(state=GenerationState.SUCCESS.value)
    now = datetime.now(timezone.utc)
    artifact_calls: list[dict] = []
    project_calls: list[dict] = []

    async def _artifact_find_many(**kwargs):
        artifact_calls.append(kwargs)
        if "select" in kwargs:
            raise TypeError(
                "ArtifactActions.find_many() got an unexpected keyword argument 'select'"
            )
        return [
            SimpleNamespace(
                id="art-ppt-001",
                type="pptx",
                basedOnVersionId="ver-001",
                metadata='{"is_current":true}',
                createdAt=now,
                updatedAt=now,
            )
        ]

    async def _project_find_unique(**kwargs):
        project_calls.append(kwargs)
        if "select" in kwargs:
            raise TypeError(
                "ProjectActions.find_unique() got an unexpected keyword argument 'select'"
            )
        return SimpleNamespace(id="p-001", currentVersionId="ver-009")

    db = SimpleNamespace(
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
        artifact=SimpleNamespace(find_many=AsyncMock(side_effect=_artifact_find_many)),
        project=SimpleNamespace(
            find_unique=AsyncMock(side_effect=_project_find_unique)
        ),
        candidatechange=SimpleNamespace(find_first=AsyncMock(return_value=None)),
    )
    service = GenerationSessionService(db=db)
    service._guard.get_allowed_actions = Mock(return_value=["export"])

    payload = await service.get_session_snapshot(session_id="s-001", user_id="u-001")

    assert payload["artifact_id"] == "art-ppt-001"
    assert payload["current_version_id"] == "ver-009"
    assert len(artifact_calls) == 2
    assert "select" in artifact_calls[0]
    assert "select" not in artifact_calls[1]
    assert len(project_calls) == 2
    assert "select" in project_calls[0]
    assert "select" not in project_calls[1]


@pytest.mark.anyio
async def test_get_session_snapshot_includes_latest_candidate_change():
    session = _fake_session(state=GenerationState.SUCCESS.value)
    change = SimpleNamespace(
        id="c-001",
        projectId="p-001",
        sessionId="s-001",
        baseVersionId="ver-002",
        title="candidate change",
        summary="summary",
        payload='{"review":{"accepted_version_id":"ver-003"}}',
        status="accepted",
        reviewComment="looks good",
        proposerUserId="u-001",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
    )
    db = SimpleNamespace(
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
        candidatechange=SimpleNamespace(find_first=AsyncMock(return_value=change)),
    )
    service = GenerationSessionService(db=db)
    service._guard.get_allowed_actions = Mock(return_value=["export"])

    payload = await service.get_session_snapshot(session_id="s-001", user_id="u-001")

    assert payload["latest_candidate_change"]["id"] == "c-001"
    assert payload["latest_candidate_change"]["accepted_version_id"] == "ver-003"
    assert payload["latest_candidate_change"]["review_comment"] == "looks good"


@pytest.mark.anyio
async def test_create_session_reuses_project_current_version_as_base_when_missing():
    existing_session = SimpleNamespace(
        id="s-existing",
        projectId="p-001",
        userId="u-001",
        baseVersionId=None,
        state=GenerationState.IDLE.value,
        stateReason=None,
        outputType=SessionOutputType.PPT.value,
        options=None,
        clientSessionId="s-existing",
        renderVersion=0,
        currentOutlineVersion=0,
        resumable=True,
        updatedAt=datetime.now(timezone.utc),
        progress=0,
    )
    updated_payload = dict(existing_session.__dict__)
    updated_payload["baseVersionId"] = "ver-current-002"
    updated_payload["state"] = GenerationState.DRAFTING_OUTLINE.value
    updated_session = SimpleNamespace(**updated_payload)
    db = SimpleNamespace(
        project=SimpleNamespace(
            find_unique=AsyncMock(
                return_value=SimpleNamespace(
                    id="p-001",
                    currentVersionId="ver-current-002",
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
    service._schedule_outline_draft_task = AsyncMock()

    session_ref = await service.create_session(
        project_id="p-001",
        user_id="u-001",
        output_type=SessionOutputType.PPT.value,
        client_session_id="s-existing",
        options={"pages": 6},
        task_queue_service=None,
    )

    assert session_ref["session_id"] == "s-existing"
    assert session_ref["base_version_id"] == "ver-current-002"
    db.project.find_unique.assert_awaited_once_with(where={"id": "p-001"})


@pytest.mark.anyio
async def test_get_session_runtime_state_uses_lightweight_select():
    db = SimpleNamespace(
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(
                return_value={
                    "userId": "u-001",
                    "state": "RENDERING",
                    "lastCursor": "c-101",
                    "updatedAt": datetime.now(timezone.utc),
                }
            )
        ),
    )
    service = GenerationSessionService(db=db)

    runtime = await service.get_session_runtime_state(
        session_id="s-001",
        user_id="u-001",
    )

    assert runtime["state"] == "RENDERING"
    assert runtime["last_cursor"] == "c-101"
    call_kwargs = db.generationsession.find_unique.await_args.kwargs
    assert call_kwargs["where"] == {"id": "s-001"}
    assert set(call_kwargs["select"].keys()) == {
        "userId",
        "state",
        "lastCursor",
        "updatedAt",
    }


@pytest.mark.anyio
async def test_create_session_reuses_existing_success_session():
    existing_session = SimpleNamespace(
        id="s-success",
        projectId="p-001",
        userId="u-001",
        baseVersionId="ver-old-001",
        state=GenerationState.SUCCESS.value,
        stateReason="task_completed",
        outputType=SessionOutputType.PPT.value,
        options=None,
        clientSessionId="s-success",
        renderVersion=2,
        currentOutlineVersion=1,
        resumable=True,
        updatedAt=datetime.now(timezone.utc),
        progress=100,
    )
    updated_session = SimpleNamespace(
        id="s-success",
        projectId="p-001",
        userId="u-001",
        baseVersionId="ver-current-002",
        state=GenerationState.DRAFTING_OUTLINE.value,
        stateReason=SessionLifecycleReason.SESSION_REUSED.value,
        outputType=SessionOutputType.PPT.value,
        options='{"pages": 12}',
        clientSessionId="s-success",
        renderVersion=0,
        currentOutlineVersion=0,
        resumable=True,
        updatedAt=datetime.now(timezone.utc),
        progress=0,
    )
    db = SimpleNamespace(
        project=SimpleNamespace(
            find_unique=AsyncMock(
                return_value=SimpleNamespace(
                    id="p-001",
                    currentVersionId="ver-current-002",
                )
            )
        ),
        generationsession=SimpleNamespace(
            find_first=AsyncMock(return_value=existing_session),
            create=AsyncMock(),
            update=AsyncMock(return_value=updated_session),
        ),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )

    service = GenerationSessionService(db=db)
    service._schedule_outline_draft_task = AsyncMock()

    session_ref = await service.create_session(
        project_id="p-001",
        user_id="u-001",
        output_type=SessionOutputType.PPT.value,
        client_session_id="s-success",
        options={"pages": 12},
        task_queue_service=None,
    )

    assert session_ref["session_id"] == "s-success"
    db.generationsession.create.assert_not_awaited()
    db.generationsession.update.assert_awaited_once()
    update_payload = db.generationsession.update.await_args.kwargs["data"]
    assert update_payload["outputType"] == SessionOutputType.PPT.value
    assert update_payload["clientSessionId"] == "s-success"
    assert update_payload["state"] == GenerationState.DRAFTING_OUTLINE.value
    event_data = db.sessionevent.create.await_args.kwargs["data"]
    assert event_data["state"] == GenerationState.DRAFTING_OUTLINE.value
    assert (
        json.loads(event_data["payload"]).get("reason")
        == SessionLifecycleReason.SESSION_REUSED.value
    )


@pytest.mark.anyio
async def test_get_session_runtime_state_fallbacks_when_select_not_supported():
    calls: list[dict] = []

    async def _find_unique(**kwargs):
        calls.append(kwargs)
        if "select" in kwargs:
            raise TypeError(
                "GenerationSessionActions.find_unique() got an unexpected keyword argument 'select'"
            )
        return SimpleNamespace(
            userId="u-001",
            state="RENDERING",
            lastCursor="c-202",
            updatedAt=datetime.now(timezone.utc),
        )

    db = SimpleNamespace(
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(side_effect=_find_unique)
        )
    )
    service = GenerationSessionService(db=db)

    runtime = await service.get_session_runtime_state(
        session_id="s-001",
        user_id="u-001",
    )

    assert runtime["state"] == "RENDERING"
    assert runtime["last_cursor"] == "c-202"
    assert len(calls) == 2
    assert "select" in calls[0]
    assert "select" not in calls[1]
    assert calls[1]["where"] == {"id": "s-001"}


@pytest.mark.anyio
async def test_get_session_preview_snapshot_uses_lightweight_queries():
    session = _fake_session(state=GenerationState.SUCCESS.value)
    session.pptUrl = "/api/v1/projects/p-001/artifacts/a-ppt/download"
    session.wordUrl = "/api/v1/projects/p-001/artifacts/a-doc/download"
    db = SimpleNamespace(
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
        generationtask=SimpleNamespace(
            find_first=AsyncMock(return_value=SimpleNamespace(id="task-123"))
        ),
        artifact=SimpleNamespace(
            find_first=AsyncMock(
                return_value=SimpleNamespace(id="a-123", basedOnVersionId="ver-001")
            )
        ),
        project=SimpleNamespace(
            find_unique=AsyncMock(
                return_value=SimpleNamespace(currentVersionId="ver-009")
            )
        ),
    )
    service = GenerationSessionService(db=db)

    payload = await service.get_session_preview_snapshot(
        session_id="s-001",
        user_id="u-001",
    )

    assert payload["session"]["task_id"] == "task-123"
    assert payload["artifact_id"] == "a-123"
    assert payload["based_on_version_id"] == "ver-001"
    assert payload["current_version_id"] == "ver-009"
    assert payload["upstream_updated"] is True
    assert payload["result"]["ppt_url"] == session.pptUrl
    assert payload["result"]["word_url"] == session.wordUrl
    session_lookup = db.generationsession.find_unique.await_args.kwargs
    assert "include" not in session_lookup
    assert set(session_lookup["select"].keys()) == {
        "id",
        "projectId",
        "userId",
        "baseVersionId",
        "state",
        "stateReason",
        "progress",
        "resumable",
        "updatedAt",
        "renderVersion",
        "options",
        "pptUrl",
        "wordUrl",
    }


@pytest.mark.anyio
async def test_get_session_preview_snapshot_gracefully_handles_missing_artifacts():
    session = _fake_session(state=GenerationState.RENDERING.value)
    db = SimpleNamespace(
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
        generationtask=SimpleNamespace(find_first=AsyncMock(return_value=None)),
        get_project=AsyncMock(return_value=SimpleNamespace(currentVersionId="ver-002")),
    )
    service = GenerationSessionService(db=db)

    payload = await service.get_session_preview_snapshot(
        session_id="s-001",
        user_id="u-001",
    )

    assert payload["artifact_id"] is None
    assert payload["based_on_version_id"] is None
    assert payload["current_version_id"] == "ver-002"
    assert payload["upstream_updated"] is False
    assert payload["result"] is None


@pytest.mark.anyio
async def test_get_session_snapshot_loads_latest_outline_and_task_from_models():
    session = _fake_session(
        state=GenerationState.SUCCESS.value, options='{"pages": 12}'
    )
    db = SimpleNamespace(
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
        outlineversion=SimpleNamespace(
            find_first=AsyncMock(
                return_value=SimpleNamespace(
                    version=2,
                    outlineData='{"title":"优化后大纲","sections":[]}',
                )
            )
        ),
        generationtask=SimpleNamespace(
            find_first=AsyncMock(return_value=SimpleNamespace(id="task-999"))
        ),
        candidatechange=SimpleNamespace(find_first=AsyncMock(return_value=None)),
    )
    service = GenerationSessionService(db=db)
    service._guard.get_allowed_actions = Mock(return_value=["export"])

    payload = await service.get_session_snapshot(session_id="s-001", user_id="u-001")

    assert payload["outline"]["title"] == "优化后大纲"
    assert payload["outline"]["version"] == 2
    assert payload["session"]["task_id"] == "task-999"
    db.outlineversion.find_first.assert_awaited_once_with(
        where={"sessionId": "s-001"},
        order={"version": "desc"},
    )
    db.generationtask.find_first.assert_awaited_once_with(
        where={"sessionId": "s-001"},
        order={"createdAt": "desc"},
    )
    session_lookup = db.generationsession.find_unique.await_args.kwargs
    assert "include" not in session_lookup


@pytest.mark.anyio
async def test_handle_update_outline_uses_latest_persisted_version_as_source_of_truth():
    db = SimpleNamespace(
        outlineversion=SimpleNamespace(
            find_first=AsyncMock(
                return_value=SimpleNamespace(
                    id="ov-002",
                    version=2,
                    outlineData='{"version":1,"nodes":[{"title":"旧版"}]}',
                )
            ),
            create=AsyncMock(),
            update=AsyncMock(),
        ),
        generationsession=SimpleNamespace(update=AsyncMock()),
    )
    append_event = AsyncMock()
    session = SimpleNamespace(id="s-001", currentOutlineVersion=1)

    await handle_update_outline(
        db=db,
        session=session,
        command={
            "base_version": 2,
            "outline": {"nodes": [{"title": "新版大纲"}]},
            "change_reason": "manual_edit",
        },
        new_state=GenerationState.AWAITING_OUTLINE_CONFIRM.value,
        append_event=append_event,
        conflict_error_cls=ConflictError,
    )

    created_payload = db.outlineversion.create.await_args.kwargs["data"]
    stored_outline = json.loads(created_payload["outlineData"])
    assert created_payload["version"] == 3
    assert stored_outline["version"] == 3
    session_update = db.generationsession.update.await_args_list[0].kwargs["data"]
    assert session_update["currentOutlineVersion"] == 3


@pytest.mark.anyio
async def test_handle_update_outline_treats_replayed_stale_write_as_success():
    outline_record = SimpleNamespace(
        id="ov-002",
        version=2,
        outlineData=json.dumps(
            {
                "version": 2,
                "nodes": [{"title": "导入 · 知识地图"}],
            }
        ),
    )
    db = SimpleNamespace(
        outlineversion=SimpleNamespace(
            find_first=AsyncMock(return_value=outline_record),
            create=AsyncMock(),
            update=AsyncMock(),
        ),
        generationsession=SimpleNamespace(update=AsyncMock()),
    )
    append_event = AsyncMock()
    session = SimpleNamespace(id="s-001", currentOutlineVersion=1)

    await handle_update_outline(
        db=db,
        session=session,
        command={
            "base_version": 1,
            "outline": {"nodes": [{"title": "导入 · 知识地图"}]},
            "change_reason": None,
        },
        new_state=GenerationState.AWAITING_OUTLINE_CONFIRM.value,
        append_event=append_event,
        conflict_error_cls=ConflictError,
    )

    db.outlineversion.create.assert_not_awaited()
    db.generationsession.update.assert_awaited_once()
    assert (
        db.generationsession.update.await_args.kwargs["data"]["currentOutlineVersion"]
        == 2
    )
    append_event.assert_not_awaited()


# ===========================================================================
# Outline streaming regression tests (Issue-backend)
# ===========================================================================


@pytest.mark.anyio
async def test_create_session_returns_quickly_without_waiting_for_outline():
    db = SimpleNamespace(
        project=SimpleNamespace(
            find_unique=AsyncMock(
                return_value=SimpleNamespace(
                    id="p-001",
                    currentVersionId="ver-current-001",
                )
            )
        ),
        generationsession=SimpleNamespace(
            create=AsyncMock(
                return_value=SimpleNamespace(
                    id="s-new",
                    projectId="p-001",
                    userId="u-001",
                    baseVersionId="ver-current-001",
                    state=GenerationState.DRAFTING_OUTLINE.value,
                    stateReason=None,
                    outputType="ppt",
                    options=None,
                    clientSessionId=None,
                    renderVersion=0,
                    currentOutlineVersion=0,
                    resumable=True,
                    updatedAt=datetime.now(timezone.utc),
                    progress=0,
                )
            ),
            update=AsyncMock(),
        ),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )

    service = GenerationSessionService(db=db)
    service._schedule_outline_draft_task = AsyncMock()

    session_ref = await service.create_session(
        project_id="p-001",
        user_id="u-001",
        output_type=SessionOutputType.PPT.value,
        options={"pages": 10},
        task_queue_service=None,
    )

    assert session_ref["session_id"] == "s-new"
    assert session_ref["state"] == GenerationState.DRAFTING_OUTLINE.value
    assert session_ref["project_id"] == "p-001"
    assert session_ref["base_version_id"] == "ver-current-001"
    db.sessionevent.create.assert_called_once()
    event_data = db.sessionevent.create.await_args.kwargs["data"]
    assert event_data["eventType"] == GenerationEventType.STATE_CHANGED.value
    assert event_data["state"] == GenerationState.DRAFTING_OUTLINE.value
    service._schedule_outline_draft_task.assert_called_once()


@pytest.mark.anyio
async def test_execute_outline_draft_local_success_path():
    from unittest.mock import patch

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
            SimpleNamespace(
                title="Section 1", key_points=["Point 1", "Point 2"], slide_count=2
            )
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
    progress_events = [
        e
        for e in event_calls
        if e["eventType"] == GenerationEventType.PROGRESS_UPDATED.value
    ]
    outline_events = [
        e
        for e in event_calls
        if e["eventType"] == GenerationEventType.OUTLINE_UPDATED.value
    ]
    outline_started_events = [
        e
        for e in event_calls
        if e["eventType"] == GenerationEventType.OUTLINE_STARTED.value
    ]
    outline_section_events = [
        e
        for e in event_calls
        if e["eventType"] == GenerationEventType.OUTLINE_SECTION_GENERATED.value
    ]
    outline_completed_events = [
        e
        for e in event_calls
        if e["eventType"] == GenerationEventType.OUTLINE_COMPLETED.value
    ]
    state_events = [
        e
        for e in event_calls
        if e["eventType"] == GenerationEventType.STATE_CHANGED.value
    ]

    assert progress_events
    assert outline_started_events
    assert outline_section_events
    assert outline_completed_events
    assert outline_events
    progress_payload = json.loads(progress_events[0]["payload"])
    assert progress_payload["retrieval_mode"] == "default_library"
    assert progress_payload["policy_version"] == "prompt-policy-v2026-03-28"
    assert progress_payload["baseline_id"] == "prompt-baseline-v1"
    outline_payload = json.loads(outline_events[0]["payload"])
    assert outline_payload["retrieval_mode"] == "default_library"
    assert outline_payload["policy_version"] == "prompt-policy-v2026-03-28"
    assert outline_payload["baseline_id"] == "prompt-baseline-v1"
    assert any(
        e["state"] == GenerationState.AWAITING_OUTLINE_CONFIRM.value
        for e in state_events
    )
    db.outlineversion.create.assert_called_once()
    outline_data = db.outlineversion.create.await_args.kwargs["data"]
    assert outline_data["version"] == 1
    assert outline_data["changeReason"] == "drafted_async"


@pytest.mark.anyio
async def test_execute_outline_draft_local_failure_path():
    import json
    from unittest.mock import patch

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

    event_calls = [
        call.kwargs["data"] for call in db.sessionevent.create.await_args_list
    ]
    failed_events = [
        e
        for e in event_calls
        if e["eventType"] == GenerationEventType.TASK_FAILED.value
    ]
    generation_failed_events = [
        e
        for e in event_calls
        if e["eventType"] == GenerationEventType.GENERATION_FAILED.value
    ]
    assert len(failed_events) == 1
    assert len(generation_failed_events) == 1
    failed_payload = json.loads(failed_events[0]["payload"])
    assert failed_payload["stage"] == "outline_draft"
    assert failed_payload["error_code"] == OutlineGenerationErrorCode.FAILED.value
    assert failed_payload["retryable"] is True
    assert "trace_id" in failed_payload
    assert failed_payload["retrieval_mode"] == "default_library"
    assert failed_payload["policy_version"] == "prompt-policy-v2026-03-28"
    assert failed_payload["baseline_id"] == "prompt-baseline-v1"

    db.outlineversion.create.assert_called_once()
    outline_data = db.outlineversion.create.await_args.kwargs["data"]
    assert outline_data["version"] == 1
    assert outline_data["changeReason"] == "draft_failed_fallback_empty"
    outline_doc = json.loads(outline_data["outlineData"])
    assert len(outline_doc["nodes"]) == 10
    assert all(str(node.get("title", "")).strip() for node in outline_doc["nodes"])

    state_updates = [
        call.kwargs["data"]
        for call in db.generationsession.update.await_args_list
        if "state" in (call.kwargs.get("data") or {})
    ]
    assert any(
        update.get("state") == GenerationState.AWAITING_OUTLINE_CONFIRM.value
        and update.get("stateReason")
        == OutlineGenerationStateReason.FAILED_FALLBACK_EMPTY.value
        for update in state_updates
    )


@pytest.mark.anyio
async def test_schedule_outline_draft_task_uses_rq_when_available():
    db = SimpleNamespace()
    service = GenerationSessionService(db=db)

    mock_queue_service = Mock()
    mock_queue_service.get_queue_info = Mock(return_value={"workers": {"count": 1}})
    mock_queue_service.enqueue_outline_draft_task = Mock(
        return_value=Mock(id="job-123")
    )

    await service._schedule_outline_draft_task(
        session_id="s-001",
        project_id="p-001",
        options={"pages": 10},
        task_queue_service=mock_queue_service,
    )

    mock_queue_service.enqueue_outline_draft_task.assert_called_once_with(
        session_id="s-001",
        project_id="p-001",
        options={"pages": 10},
        priority="default",
        timeout=300,
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

    event_calls = [
        call.kwargs["data"] for call in db.sessionevent.create.await_args_list
    ]
    failed_events = [
        e
        for e in event_calls
        if e["eventType"] == GenerationEventType.TASK_FAILED.value
    ]
    assert len(failed_events) == 1
    failed_payload = json.loads(failed_events[0]["payload"])
    assert failed_payload["error_code"] == OutlineGenerationErrorCode.TIMEOUT.value
    assert failed_payload["error_message"] == "大纲生成超时，请稍后重试。"

    state_updates = [
        call.kwargs["data"]
        for call in db.generationsession.update.await_args_list
        if "state" in (call.kwargs.get("data") or {})
    ]
    assert any(
        update.get("state") == GenerationState.AWAITING_OUTLINE_CONFIRM.value
        and update.get("stateReason")
        == OutlineGenerationStateReason.TIMED_OUT_FALLBACK_EMPTY.value
        for update in state_updates
    )


@pytest.mark.anyio
async def test_schedule_outline_draft_task_fallback_to_local_when_rq_fails():
    from unittest.mock import patch

    db = SimpleNamespace()
    service = GenerationSessionService(db=db)

    mock_queue_service = Mock()
    mock_queue_service.get_queue_info = Mock(return_value={"workers": {"count": 1}})
    mock_queue_service.enqueue_outline_draft_task = Mock(
        side_effect=Exception("Redis connection failed")
    )

    def _close_task(coro):
        coro.close()
        return Mock()

    with patch("asyncio.create_task", side_effect=_close_task) as mock_create_task:
        await service._schedule_outline_draft_task(
            session_id="s-001",
            project_id="p-001",
            options={"pages": 10},
            task_queue_service=mock_queue_service,
        )

    mock_create_task.assert_called_once()


@pytest.mark.anyio
async def test_schedule_outline_draft_task_fallback_to_local_when_no_worker():
    from unittest.mock import patch

    db = SimpleNamespace()
    service = GenerationSessionService(db=db)

    mock_queue_service = Mock()
    mock_queue_service.get_queue_info = Mock(return_value={"workers": {"count": 0}})
    mock_queue_service.enqueue_outline_draft_task = Mock()

    def _close_task(coro):
        coro.close()
        return Mock()

    with patch("asyncio.create_task", side_effect=_close_task) as mock_create_task:
        await service._schedule_outline_draft_task(
            session_id="s-001",
            project_id="p-001",
            options={"pages": 10},
            task_queue_service=mock_queue_service,
        )

    mock_create_task.assert_called_once()
    mock_queue_service.enqueue_outline_draft_task.assert_not_called()


@pytest.mark.anyio
async def test_schedule_outline_draft_task_fallback_to_local_when_queue_health_unknown():
    from unittest.mock import patch

    db = SimpleNamespace()
    service = GenerationSessionService(db=db)

    mock_queue_service = Mock()
    mock_queue_service.get_queue_info = Mock(
        return_value={
            "workers": {"count": 0, "stale": ["worker-old"]},
            "error": "redis",
        }
    )
    mock_queue_service.enqueue_outline_draft_task = Mock()

    def _close_task(coro):
        coro.close()
        return Mock()

    with patch("asyncio.create_task", side_effect=_close_task) as mock_create_task:
        await service._schedule_outline_draft_task(
            session_id="s-001",
            project_id="p-001",
            options={"pages": 10},
            task_queue_service=mock_queue_service,
        )

    mock_create_task.assert_called_once()
    mock_queue_service.enqueue_outline_draft_task.assert_not_called()


@pytest.mark.anyio
async def test_execute_outline_draft_local_skips_when_session_already_drafted():
    db = SimpleNamespace(
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(
                return_value={
                    "state": GenerationState.AWAITING_OUTLINE_CONFIRM.value,
                    "currentOutlineVersion": 1,
                }
            ),
            update=AsyncMock(),
        ),
        sessionevent=SimpleNamespace(create=AsyncMock()),
        outlineversion=SimpleNamespace(create=AsyncMock()),
        project=SimpleNamespace(find_unique=AsyncMock()),
    )
    service = GenerationSessionService(db=db)

    await service._execute_outline_draft_local(
        session_id="s-001",
        project_id="p-001",
        options={"pages": 10},
    )

    db.outlineversion.create.assert_not_called()
    db.sessionevent.create.assert_not_called()
