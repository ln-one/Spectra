from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.card_execution_runtime_artifacts import (
    _resolve_initial_artifact_mode,
    execute_studio_card_artifact_request,
    execute_studio_card_structured_refine,
)
from services.generation_session_service.card_execution_runtime_simulator import (
    normalize_simulator_turn_result,
)
from services.generation_session_service.card_execution_runtime_helpers import (
    build_latest_runnable_state,
)
from services.generation_session_service.card_execution_runtime_word import (
    resolve_word_document_title,
)
from services.project_space_service.service import project_space_service
from schemas.studio_cards import StudioCardResolvedRequest
from utils.exceptions import APIException, ErrorCode


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
        user_id="u-001",
        config={"topic": "不会被采用"},
        existing_title="",
    )

    assert title == "计算机图形学教案"


@pytest.mark.anyio
async def test_resolve_word_document_title_ignores_placeholder_existing_title(monkeypatch):
    source_artifact = SimpleNamespace(
        metadata={"title": "计算机网络物理层"},
    )
    monkeypatch.setattr(
        project_space_service,
        "get_artifact",
        AsyncMock(return_value=source_artifact),
    )

    title = await resolve_word_document_title(
        source_artifact_id="ppt-art-002",
        user_id="u-001",
        config={"topic": "不会被采用"},
        existing_title="第31次讲义文档",
    )

    assert title == "计算机网络物理层教案"


@pytest.mark.anyio
async def test_resolve_word_document_title_treats_untitled_document_as_placeholder(
    monkeypatch,
):
    source_artifact = SimpleNamespace(
        metadata={"title": "细胞膜的结构与功能"},
    )
    monkeypatch.setattr(
        project_space_service,
        "get_artifact",
        AsyncMock(return_value=source_artifact),
    )

    title = await resolve_word_document_title(
        source_artifact_id="ppt-art-003",
        user_id="u-001",
        config={"topic": "不会被采用"},
        existing_title="未命名文档",
    )

    assert title == "细胞膜的结构与功能教案"


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("card_id", "artifact_type"),
    [
        ("word_document", "docx"),
        ("knowledge_mindmap", "mindmap"),
        ("interactive_quick_quiz", "exercise"),
        ("interactive_games", "html"),
    ],
)
async def test_structured_refine_updates_managed_artifact_in_place(
    monkeypatch,
    card_id,
    artifact_type,
):
    source_artifact = SimpleNamespace(
        id="artifact-001",
        projectId="project-001",
        sessionId="session-001",
        type=artifact_type,
        visibility="private",
        basedOnVersionId="version-001",
        metadata={"title": "旧成果"},
    )
    updated_artifact = SimpleNamespace(
        id="artifact-001",
        projectId="project-001",
        sessionId="session-001",
        type=artifact_type,
        visibility="private",
        basedOnVersionId="version-001",
        metadata={"title": "新成果"},
    )
    body = SimpleNamespace(
        project_id="project-001",
        session_id="session-001",
        artifact_id="artifact-001",
        source_artifact_id=None,
        message="请更新内容",
        config={"topic": "test"},
        rag_source_ids=[],
        selection_anchor=None,
        refine_mode=SimpleNamespace(value="structured_refine"),
        primary_source_id=None,
        selected_source_ids=[],
    )
    preview = SimpleNamespace(
        readiness="ready",
        refine_request={
            "method": "POST",
            "endpoint": f"/studio-cards/{card_id}/refine",
            "mode": "structured_refine",
        },
        execution_carrier="artifact",
    )

    validate_artifact_mock = AsyncMock(return_value=source_artifact)
    build_content_mock = AsyncMock(return_value={"title": "新成果"})
    update_existing_mock = AsyncMock(return_value=updated_artifact)
    create_replacement_mock = AsyncMock()
    create_run_mock = AsyncMock(
        return_value={"run_id": "run-001", "run_no": 1, "artifact_id": "artifact-001"}
    )

    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.validate_structured_refine_artifact",
        validate_artifact_mock,
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.build_structured_refine_artifact_content",
        build_content_mock,
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.update_existing_artifact",
        update_existing_mock,
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.create_replacement_artifact",
        create_replacement_mock,
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.create_artifact_run",
        create_run_mock,
    )
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )

    result = await execute_studio_card_structured_refine(
        card_id=card_id,
        body=body,
        user_id="user-001",
        preview=preview,
        load_content=AsyncMock(return_value={"title": "旧成果"}),
    )

    update_existing_mock.assert_awaited_once()
    create_replacement_mock.assert_not_called()
    assert result.artifact["id"] == "artifact-001"
    assert result.artifact["replaces_artifact_id"] is None
    assert result.latest_runnable_state["active_artifact_id"] == "artifact-001"


@pytest.mark.anyio
async def test_word_direct_edit_structured_refine_skips_loading_existing_docx_content(
    monkeypatch,
):
    source_artifact = SimpleNamespace(
        id="artifact-001",
        projectId="project-001",
        sessionId="session-001",
        type="docx",
        visibility="private",
        basedOnVersionId="version-001",
        metadata={"title": "原教学文档"},
    )
    updated_artifact = SimpleNamespace(
        id="artifact-001",
        projectId="project-001",
        sessionId="session-001",
        type="docx",
        visibility="private",
        basedOnVersionId="version-001",
        metadata={"title": "原教学文档"},
    )
    body = SimpleNamespace(
        project_id="project-001",
        session_id="session-001",
        artifact_id="artifact-001",
        source_artifact_id=None,
        message="更新文档内容",
        config={
            "direct_edit": True,
            "markdown_content": "# 原教学文档\n\n## 新内容\n\n- 已修改",
        },
        rag_source_ids=[],
        selection_anchor=None,
        refine_mode=SimpleNamespace(value="structured_refine"),
        primary_source_id=None,
        selected_source_ids=[],
    )
    preview = SimpleNamespace(
        readiness="ready",
        refine_request={
            "method": "POST",
            "endpoint": "/studio-cards/word_document/refine",
            "mode": "structured_refine",
        },
        execution_carrier="artifact",
    )

    validate_artifact_mock = AsyncMock(return_value=source_artifact)
    build_content_mock = AsyncMock(
        return_value={
            "title": "原教学文档",
            "kind": "teaching_document",
            "legacy_kind": "word_document",
            "lesson_plan_markdown": "# 原教学文档\n\n## 新内容\n\n- 已修改",
        }
    )
    update_existing_mock = AsyncMock(return_value=updated_artifact)
    create_run_mock = AsyncMock(
        return_value={"run_id": "run-001", "run_no": 1, "artifact_id": "artifact-001"}
    )
    load_content_mock = AsyncMock(side_effect=AssertionError("should not load docx"))

    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.validate_structured_refine_artifact",
        validate_artifact_mock,
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.build_structured_refine_artifact_content",
        build_content_mock,
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.update_existing_artifact",
        update_existing_mock,
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.create_artifact_run",
        create_run_mock,
    )
    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(return_value=True),
    )

    result = await execute_studio_card_structured_refine(
        card_id="word_document",
        body=body,
        user_id="user-001",
        preview=preview,
        load_content=load_content_mock,
    )

    load_content_mock.assert_not_awaited()
    assert (
        build_content_mock.await_args.kwargs["current_content"]["title"] == "原教学文档"
    )
    assert result.artifact["id"] == "artifact-001"


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
    animation_html_state = build_latest_runnable_state(
        card_id="demonstration_animations",
        artifact_id="artifact-animation-html",
        session_id="session-1",
        source_binding_valid=False,
        placement_supported=False,
    )
    animation_gif_state = build_latest_runnable_state(
        card_id="demonstration_animations",
        artifact_id="artifact-animation-gif",
        session_id="session-1",
        source_binding_valid=True,
        placement_supported=True,
    )

    assert quiz_state["next_action"] == "answer_or_refine"
    assert simulation_state["next_action"] == "follow_up_turn"
    assert animation_html_state["next_action"] == "refine"
    assert animation_html_state["can_recommend_placement"] is False
    assert animation_gif_state["next_action"] == "placement"
    assert animation_gif_state["can_recommend_placement"] is True
    assert animation_gif_state["can_confirm_placement"] is True


@pytest.mark.anyio
async def test_execute_studio_card_artifact_request_marks_requested_run_failed_on_generation_error(
    monkeypatch,
):
    body = SimpleNamespace(
        project_id="project-001",
        client_session_id="session-001",
        run_id="run-001",
        config={"topic": "冒泡排序"},
        primary_source_id=None,
        source_artifact_id=None,
        selected_source_ids=[],
        rag_source_ids=[],
    )
    preview = SimpleNamespace(
        readiness="foundation_ready",
        initial_request=SimpleNamespace(
            payload={
                "content": {},
                "type": "html",
                "visibility": "private",
                "based_on_version_id": None,
            }
        ),
        execution_carrier="artifact",
    )
    mark_failed_mock = AsyncMock()
    create_artifact_mock = AsyncMock()

    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.resolve_execution_session_id",
        AsyncMock(return_value="session-001"),
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.resolve_effective_source_artifact_id",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.validate_source_artifact",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.promote_requested_run_to_generating",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.build_studio_tool_artifact_content",
        AsyncMock(
            side_effect=APIException(
                status_code=502,
                error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                message="AI generation failed",
                retryable=True,
            )
        ),
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.mark_requested_run_execution_failed",
        mark_failed_mock,
    )
    monkeypatch.setattr(
        project_space_service,
        "create_artifact_with_file",
        create_artifact_mock,
    )

    with pytest.raises(APIException):
        await execute_studio_card_artifact_request(
            card_id="demonstration_animations",
            body=body,
            user_id="user-001",
            preview=preview,
        )

    mark_failed_mock.assert_awaited_once()
    assert mark_failed_mock.await_args.kwargs["card_id"] == "demonstration_animations"
    assert mark_failed_mock.await_args.kwargs["session_id"] == "session-001"
    create_artifact_mock.assert_not_awaited()


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("card_id", "artifact_type", "artifact_title"),
    [
        ("word_document", "docx", "牛顿第二定律教案"),
        ("knowledge_mindmap", "mindmap", "牛顿第二定律导图"),
        ("interactive_quick_quiz", "exercise", "牛顿第二定律小测"),
        ("interactive_games", "html", "牛顿第二定律互动游戏"),
    ],
)
async def test_execute_studio_card_artifact_request_creates_new_artifact_for_initial_generation(
    monkeypatch,
    card_id,
    artifact_type,
    artifact_title,
):
    body = SimpleNamespace(
        project_id="project-001",
        client_session_id="session-001",
        run_id="run-quiz-001",
        config={"scope": "牛顿第二定律"},
        primary_source_id=None,
        source_artifact_id=None,
        selected_source_ids=[],
        rag_source_ids=[],
    )
    preview = SimpleNamespace(
        readiness="foundation_ready",
        initial_request=StudioCardResolvedRequest(
            method="POST",
            endpoint="/api/v1/projects/project-001/artifacts",
            payload={
                "content": {
                    "kind": "managed_artifact",
                    "scope": "牛顿第二定律",
                    "question_count": 5,
                },
                "type": artifact_type,
                "visibility": "private",
                "based_on_version_id": None,
            },
        ),
        execution_carrier="artifact",
    )
    created_artifact = SimpleNamespace(
        id="artifact-quiz-002",
        type=artifact_type,
        visibility="private",
        sessionId="session-001",
        metadata={"title": artifact_title},
    )

    create_artifact_mock = AsyncMock(return_value=created_artifact)

    monkeypatch.setattr(
        project_space_service,
        "check_project_permission",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.resolve_execution_session_id",
        AsyncMock(return_value="session-001"),
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.resolve_effective_source_artifact_id",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.validate_source_artifact",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.promote_requested_run_to_generating",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.build_studio_tool_artifact_content",
        AsyncMock(
            return_value={
                "title": artifact_title,
                "scope": "牛顿第二定律",
                "question_count": 5,
                "questions": [],
            }
        ),
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.build_source_snapshot_payload",
        AsyncMock(return_value={}),
    )
    monkeypatch.setattr(
        project_space_service,
        "create_artifact_with_file",
        create_artifact_mock,
    )
    monkeypatch.setattr(
        "services.generation_session_service.card_execution_runtime_artifacts.create_artifact_run",
        AsyncMock(return_value={"run_id": "run-quiz-001", "run_no": 1}),
    )

    result = await execute_studio_card_artifact_request(
        card_id=card_id,
        body=body,
        user_id="user-001",
        preview=preview,
    )

    assert result.artifact["id"] == "artifact-quiz-002"
    assert create_artifact_mock.await_args.kwargs["artifact_mode"] == "create"


@pytest.mark.parametrize(
    "card_id",
    [
        "word_document",
        "knowledge_mindmap",
        "interactive_quick_quiz",
        "interactive_games",
        "demonstration_animations",
    ],
)
def test_resolve_initial_artifact_mode_always_creates_new_artifact(card_id: str) -> None:
    assert _resolve_initial_artifact_mode(card_id) == "create"
