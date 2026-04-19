from __future__ import annotations

import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.database import db_service
from services.generation_session_service.card_execution_runtime_run_helpers import (
    create_artifact_run,
)
from services.generation_session_service.card_execution_runtime_simulator import (
    normalize_simulator_turn_result,
)
from services.generation_session_service.card_execution_runtime_helpers import (
    build_latest_runnable_state,
)
from services.generation_session_service.tool_content_builder_generation import (
    generate_simulator_turn_update,
)
from services.generation_session_service.card_execution_runtime_word import (
    resolve_word_document_title,
)
from services.project_space_service.service import project_space_service


@pytest.mark.anyio
async def test_create_artifact_run_appends_task_completed_event_for_bound_session(
    monkeypatch,
):
    now = datetime.now(timezone.utc)
    artifact = SimpleNamespace(
        id="artifact-001",
        projectId="project-001",
        sessionId="session-001",
        type="exercise",
        metadata={},
        createdAt=now,
        updatedAt=now,
    )
    body = SimpleNamespace(project_id="project-001", config={"question_count": 5})
    pending_run = SimpleNamespace(
        id="run-001",
        sessionId="session-001",
        projectId="project-001",
        toolType="studio_card:interactive_quick_quiz",
        runNo=1,
        title="第1次随堂小测",
        titleSource="pending",
        titleUpdatedAt=None,
        status="processing",
        step="generate",
        artifactId="artifact-001",
        createdAt=now,
        updatedAt=now,
    )
    completed_run = SimpleNamespace(
        id="run-001",
        sessionId="session-001",
        projectId="project-001",
        toolType="studio_card:interactive_quick_quiz",
        runNo=1,
        title="第1次随堂小测",
        titleSource="pending",
        titleUpdatedAt=None,
        status="completed",
        step="completed",
        artifactId="artifact-001",
        createdAt=now,
        updatedAt=now,
    )

    db_handle = SimpleNamespace(
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(
                return_value=SimpleNamespace(
                    id="session-001",
                    state="IDLE",
                    stateReason=None,
                    progress=0,
                )
            ),
            update=AsyncMock(),
        ),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )
    monkeypatch.setattr(db_service, "db", db_handle)
    monkeypatch.setattr(
        project_space_service,
        "update_artifact_metadata",
        AsyncMock(),
    )

    monkeypatch.setattr(
        "services.generation_session_service.session_history.create_session_run",
        AsyncMock(return_value=pending_run),
    )
    monkeypatch.setattr(
        "services.generation_session_service.session_history.update_session_run",
        AsyncMock(return_value=completed_run),
    )
    monkeypatch.setattr(
        "services.generation_session_service.session_history.request_run_title_generation",
        AsyncMock(return_value=True),
    )

    run_payload = await create_artifact_run(
        card_id="interactive_quick_quiz",
        body=body,
        artifact=artifact,
        session_id="session-001",
    )

    assert run_payload["run_id"] == "run-001"
    db_handle.sessionevent.create.assert_awaited_once()
    event_data = db_handle.sessionevent.create.await_args.kwargs["data"]
    payload = json.loads(event_data["payload"])
    assert event_data["eventType"] == "task.completed"
    assert event_data["sessionId"] == "session-001"
    assert payload["stage"] == "studio_card_execute"
    assert payload["card_id"] == "interactive_quick_quiz"
    assert payload["artifact_id"] == "artifact-001"
    assert payload["run_trace"]["run_id"] == "run-001"


@pytest.mark.anyio
async def test_resolve_word_document_title_prefers_source_ppt_title(monkeypatch):
    source_artifact = SimpleNamespace(
        metadata={"title": "计算机图形学课件"},
    )
    monkeypatch.setattr(
        project_space_service,
        "get_artifact",
        AsyncMock(return_value=source_artifact),
    )

    title = await resolve_word_document_title(
        source_artifact_id="ppt-art-001",
        config={"topic": "不会被采用"},
        existing_title="",
    )

    assert title == "计算机图形学教案"


def test_normalize_simulator_turn_result_backfills_required_fields() -> None:
    result = normalize_simulator_turn_result(
        turn_result={
            "turn_anchor": "turn-2",
            "student_question": "边界条件什么时候失效？",
            "analysis": "建议先补条件再给反例。",
            "quality_score": "88",
        },
        teacher_answer="先解释条件，再给反例。",
        config={"profile": "detail_oriented"},
    )

    assert result.student_profile == "detail_oriented"
    assert result.feedback == "建议先补条件再给反例。"
    assert result.teacher_answer == "先解释条件，再给反例。"
    assert result.score == 88


def test_build_latest_runnable_state_uses_card_specific_next_action() -> None:
    quiz_state = build_latest_runnable_state(
        card_id="interactive_quick_quiz",
        artifact_id="artifact-quiz-1",
        session_id=None,
        source_binding_valid=True,
    )
    simulation_state = build_latest_runnable_state(
        card_id="classroom_qa_simulator",
        artifact_id="artifact-sim-1",
        session_id="session-1",
        source_binding_valid=True,
    )

    assert quiz_state["next_action"] == "answer_or_refine"
    assert simulation_state["next_action"] == "follow_up_turn"


@pytest.mark.anyio
async def test_generate_simulator_turn_update_normalizes_turn_history(monkeypatch):
    monkeypatch.setattr(
        "services.generation_session_service.tool_content_builder_generation._generate_json_payload",
        AsyncMock(
            return_value=(
                {
                    "updated_content": {
                        "title": "课堂问答模拟",
                        "summary": "进入下一轮追问。",
                        "question_focus": "速度与加速度",
                    },
                    "turn_result": {
                        "turn_anchor": "turn-2",
                        "student_profile": "detail_oriented",
                        "student_question": "减速时加速度方向如何判断？",
                        "feedback": "建议让学生先举一个反例。",
                        "score": 90,
                        "next_focus": "反例构造",
                    },
                },
                "openai/test-model",
            )
        ),
    )

    updated_content, turn_result = await generate_simulator_turn_update(
        current_content={
            "kind": "classroom_qa_simulator",
            "title": "课堂问答模拟",
            "summary": "已有首轮。",
            "turns": [
                {
                    "student_profile": "detail_oriented",
                    "student_question": "如果速度向右，合力一定向右吗？",
                    "teacher_answer": "先拆开速度和合力方向。",
                    "feedback": "先区分速度方向与加速度方向。",
                }
            ],
        },
        teacher_answer="看速度变化趋势，再判断加速度方向。",
        config={"topic": "牛顿第二定律"},
        rag_snippets=[],
    )

    assert updated_content["schema_version"] == "classroom_qa_simulator.v2"
    assert len(updated_content["turns"]) == 2
    assert updated_content["turns"][0]["turn_anchor"] == "turn-1"
    assert updated_content["turns"][1]["turn_anchor"] == "turn-2"
    assert updated_content["turns"][1]["teacher_answer"] == "看速度变化趋势，再判断加速度方向。"
    assert turn_result["turn_anchor"] == "turn-2"
    assert turn_result["next_focus"] == "反例构造"
