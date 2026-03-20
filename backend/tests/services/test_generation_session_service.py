"""Unit tests for GenerationSessionService."""

import json
from datetime import datetime, timezone
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
from services.generation_session_service.constants import (
    OutlineGenerationErrorCode,
    OutlineGenerationStateReason,
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
        ),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )
    service = GenerationSessionService(db=db)

    queue = Mock()
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
            metadata='{"kind":"outline"}',
            based_on_version_id="ver-002",
        ),
        _fake_artifact(
            artifact_id="art-ppt-001",
            artifact_type="pptx",
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
    )
    service = GenerationSessionService(db=db)
    service._guard.get_allowed_actions = Mock(return_value=["export"])

    payload = await service.get_session_snapshot(session_id="s-001", user_id="u-001")

    assert len(payload["session_artifacts"]) == 3
    assert payload["artifact_id"] == "art-outline-001"
    assert payload["based_on_version_id"] == "ver-002"
    assert payload["artifact_anchor"] == {
        "session_id": "s-001",
        "artifact_id": "art-outline-001",
        "based_on_version_id": "ver-002",
    }
    assert payload["session_artifacts"][0]["artifact_id"] == "art-outline-001"
    assert payload["session_artifacts"][0]["capability"] == "outline"
    assert payload["session_artifacts"][0]["based_on_version_id"] == "ver-002"
    assert payload["session_artifacts"][0]["title"] == "outline-art-outl"

    group_map = {
        group["capability"]: group["items"]
        for group in payload["session_artifact_groups"]
    }
    assert set(group_map.keys()) == {"outline", "ppt", "summary"}
    assert group_map["outline"][0]["artifact_id"] == "art-outline-001"
    assert group_map["ppt"][0]["artifact_id"] == "art-ppt-001"
    assert group_map["summary"][0]["artifact_id"] == "art-summary-001"

    db.artifact.find_many.assert_awaited_once_with(
        where={"projectId": "p-001", "sessionId": "s-001"},
        order={"updatedAt": "desc"},
    )


@pytest.mark.anyio
async def test_get_session_snapshot_handles_missing_artifact_model():
    session = _fake_session(state=GenerationState.SUCCESS.value)
    db = SimpleNamespace(
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
    )
    service = GenerationSessionService(db=db)
    service._guard.get_allowed_actions = Mock(return_value=["export"])

    payload = await service.get_session_snapshot(session_id="s-001", user_id="u-001")

    assert payload["artifact_id"] is None
    assert payload["based_on_version_id"] is None
    assert payload["artifact_anchor"] == {
        "session_id": "s-001",
        "artifact_id": None,
        "based_on_version_id": None,
    }
    assert payload["session_artifacts"] == []
    assert payload["session_artifact_groups"] == []


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
    state_events = [
        e
        for e in event_calls
        if e["eventType"] == GenerationEventType.STATE_CHANGED.value
    ]

    assert progress_events
    assert outline_events
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
    assert len(failed_events) == 1
    failed_payload = json.loads(failed_events[0]["payload"])
    assert failed_payload["stage"] == "outline_draft"
    assert failed_payload["error_code"] == OutlineGenerationErrorCode.FAILED.value
    assert failed_payload["retryable"] is True
    assert "trace_id" in failed_payload

    db.outlineversion.create.assert_called_once()
    outline_data = db.outlineversion.create.await_args.kwargs["data"]
    assert outline_data["version"] == 1
    assert outline_data["changeReason"] == "draft_failed_fallback_empty"
    outline_doc = json.loads(outline_data["outlineData"])
    assert outline_doc["nodes"] == []

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
