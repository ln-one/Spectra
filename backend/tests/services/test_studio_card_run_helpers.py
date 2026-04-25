from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from services.generation_session_service.card_execution_runtime_run_helpers import (
    append_card_execution_completed_event,
    create_artifact_run,
    mark_requested_run_execution_failed,
)
from services.platform.state_transition_guard import GenerationState
from services.task_executor.constants import TaskFailureStateReason
from utils.exceptions import APIException, ErrorCode


@pytest.mark.anyio
async def test_create_artifact_run_mirrors_remote_artifact_before_binding():
    artifact_model = SimpleNamespace(
        find_unique=AsyncMock(
            side_effect=[None, SimpleNamespace(id="art-001", metadata=None)]
        ),
        create=AsyncMock(),
        update=AsyncMock(),
    )
    db_stub = SimpleNamespace(artifact=artifact_model)
    pending_run = SimpleNamespace(
        id="run-001",
        runNo=1,
        title="待生成教案",
        toolType="studio_card:word_document",
    )
    completed_run = SimpleNamespace(
        id="run-001",
        runNo=1,
        title="牛顿第二定律教案",
        toolType="studio_card:word_document",
    )
    artifact = SimpleNamespace(
        id="art-001",
        projectId="p-001",
        sessionId="sess-001",
        ownerUserId="u-001",
        type="docx",
        visibility="private",
        storagePath="uploads/artifacts/art-001.docx",
        metadata={"title": "牛顿第二定律教案"},
    )
    body = SimpleNamespace(
        project_id="p-001",
        run_id=None,
        config={"topic": "牛顿第二定律"},
    )

    with (
        patch(
            "services.generation_session_service.card_execution_runtime_run_helpers.db_service.db",
            db_stub,
        ),
        patch(
            "services.generation_session_service.session_history.create_session_run",
            AsyncMock(return_value=pending_run),
        ),
        patch(
            "services.generation_session_service.session_history.update_session_run",
            AsyncMock(side_effect=[pending_run, completed_run]),
        ) as update_run_mock,
        patch(
            "services.generation_session_service.session_history.serialize_session_run",
            lambda run: {"run_id": run.id, "run_no": run.runNo},
        ),
        patch(
            "services.generation_session_service.session_history.request_run_title_generation",
            AsyncMock(),
        ),
        patch(
            "services.project_space_service.service.project_space_service.update_artifact_metadata",
            AsyncMock(),
        ),
        patch(
            "services.generation_session_service.card_execution_runtime_run_helpers.append_card_execution_completed_event",
            AsyncMock(),
        ),
    ):
        result = await create_artifact_run(
            card_id="word_document",
            body=body,
            user_id="u-001",
            artifact=artifact,
            session_id="sess-001",
        )

    assert result == {"run_id": "run-001", "run_no": 1}
    assert artifact_model.create.await_args.kwargs["data"]["id"] == "art-001"
    assert artifact_model.create.await_args.kwargs["data"]["sessionId"] == "sess-001"
    assert update_run_mock.await_args_list[1].kwargs["artifact_id"] == "art-001"
    assert artifact_model.update.await_args.kwargs["where"] == {"id": "art-001"}
    assert '"run_id": "run-001"' in artifact_model.update.await_args.kwargs["data"][
        "metadata"
    ]


@pytest.mark.anyio
async def test_mark_requested_run_execution_failed_updates_run_and_session_state():
    run_model = SimpleNamespace(
        find_unique=AsyncMock(
            return_value=SimpleNamespace(
                id="run-001",
                projectId="p-001",
                sessionId="sess-001",
                toolType="studio_card:demonstration_animations",
            )
        ),
        update=AsyncMock(),
    )
    session_model = SimpleNamespace(
        find_unique=AsyncMock(return_value=SimpleNamespace(id="sess-001")),
        update=AsyncMock(),
    )
    event_model = SimpleNamespace(create=AsyncMock())
    db_stub = SimpleNamespace(
        sessionrun=run_model,
        generationsession=session_model,
        sessionevent=event_model,
    )
    body = SimpleNamespace(
        project_id="p-001",
        run_id="run-001",
    )

    with (
        patch(
            "services.generation_session_service.card_execution_runtime_run_helpers.db_service.db",
            db_stub,
        ),
        patch(
            "services.generation_session_service.session_history.update_session_run",
            AsyncMock(),
        ) as update_run_mock,
    ):
        await mark_requested_run_execution_failed(
            card_id="demonstration_animations",
            body=body,
            session_id="sess-001",
            error=APIException(
                status_code=502,
                error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                message="AI generation failed",
                retryable=True,
            ),
        )

    assert update_run_mock.await_args.kwargs["run_id"] == "run-001"
    assert update_run_mock.await_args.kwargs["status"] == "failed"
    assert update_run_mock.await_args.kwargs["step"] == "generate"
    first_session_update = session_model.update.await_args_list[0].kwargs
    assert first_session_update["where"] == {"id": "sess-001"}
    assert first_session_update["data"]["state"] == GenerationState.FAILED.value
    assert (
        first_session_update["data"]["stateReason"]
        == TaskFailureStateReason.FAILED_UNKNOWN_ERROR.value
    )
    assert event_model.create.await_count == 3


@pytest.mark.anyio
async def test_create_artifact_run_keeps_animation_metadata_from_snapshot_when_remote_missing():
    artifact_model = SimpleNamespace(
        find_unique=AsyncMock(
            side_effect=[None, SimpleNamespace(id="art-anim", metadata=None)]
        ),
        create=AsyncMock(),
        update=AsyncMock(),
    )
    db_stub = SimpleNamespace(artifact=artifact_model)
    pending_run = SimpleNamespace(
        id="run-anim-1",
        runNo=3,
        title="冒泡排序动画",
        toolType="studio_card:demonstration_animations",
    )
    completed_run = SimpleNamespace(
        id="run-anim-1",
        runNo=3,
        title="冒泡排序动画",
        toolType="studio_card:demonstration_animations",
    )
    artifact = SimpleNamespace(
        id="art-anim",
        projectId="p-anim",
        sessionId="sess-anim",
        ownerUserId="u-anim",
        type="html",
        visibility="private",
        storagePath="uploads/artifacts/art-anim.html",
        metadata=None,
    )
    body = SimpleNamespace(
        project_id="p-anim",
        run_id=None,
        config={"topic": "冒泡排序"},
    )
    title_snapshot = {
        "kind": "animation_storyboard",
        "title": "冒泡排序动画",
        "runtime_version": "animation_runtime.v4",
        "runtime_graph": {"timeline": {"total_steps": 3}, "steps": []},
    }

    with (
        patch(
            "services.generation_session_service.card_execution_runtime_run_helpers.db_service.db",
            db_stub,
        ),
        patch(
            "services.generation_session_service.session_history.create_session_run",
            AsyncMock(return_value=pending_run),
        ),
        patch(
            "services.generation_session_service.session_history.update_session_run",
            AsyncMock(side_effect=[pending_run, completed_run]),
        ),
        patch(
            "services.generation_session_service.session_history.serialize_session_run",
            lambda run: {"run_id": run.id, "run_no": run.runNo},
        ),
        patch(
            "services.generation_session_service.session_history.request_run_title_generation",
            AsyncMock(),
        ),
        patch(
            "services.project_space_service.service.project_space_service.get_artifact",
            AsyncMock(return_value=SimpleNamespace(id="art-anim", metadata=None)),
        ),
        patch(
            "services.project_space_service.service.project_space_service.update_artifact_metadata",
            AsyncMock(),
        ) as update_metadata_mock,
        patch(
            "services.generation_session_service.card_execution_runtime_run_helpers.append_card_execution_completed_event",
            AsyncMock(),
        ),
    ):
        await create_artifact_run(
            card_id="demonstration_animations",
            body=body,
            user_id="u-anim",
            artifact=artifact,
            session_id="sess-anim",
            title_snapshot=title_snapshot,
        )

    metadata_payload = update_metadata_mock.await_args.args[1]
    assert metadata_payload["kind"] == "animation_storyboard"
    assert metadata_payload["content_snapshot"]["kind"] == "animation_storyboard"
    assert metadata_payload["run_id"] == "run-anim-1"


@pytest.mark.anyio
async def test_append_card_execution_completed_event_emits_state_changed_event():
    session_model = SimpleNamespace(
        find_unique=AsyncMock(return_value=SimpleNamespace(id="sess-001", options=None)),
        update=AsyncMock(return_value=SimpleNamespace(id="sess-001", options=None)),
    )
    event_model = SimpleNamespace(create=AsyncMock())
    db_stub = SimpleNamespace(
        generationsession=session_model,
        sessionevent=event_model,
    )
    artifact = SimpleNamespace(
        id="art-001",
        type="html",
    )
    run = SimpleNamespace(
        id="run-001",
        runNo=1,
        title="冒泡排序动画",
        toolType="studio_card:demonstration_animations",
        status="completed",
        step="completed",
    )

    with patch(
        "services.generation_session_service.card_execution_runtime_run_helpers.db_service.db",
        db_stub,
    ):
        await append_card_execution_completed_event(
            card_id="demonstration_animations",
            session_id="sess-001",
            artifact=artifact,
            run=run,
        )

    event_types = [call.kwargs["data"]["eventType"] for call in event_model.create.await_args_list]
    assert "task.completed" in event_types
    assert "state.changed" in event_types
