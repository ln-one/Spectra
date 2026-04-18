from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers.generate_sessions import router as generate_sessions_router
from utils.dependencies import get_current_user, get_current_user_optional
from utils.exceptions import APIException, ErrorCode


def _build_test_app() -> FastAPI:
    app = FastAPI()
    app.state.task_queue_service = None
    app.include_router(generate_sessions_router, prefix="/api/v1")
    return app


@pytest.fixture
def app():
    return _build_test_app()


@pytest.fixture()
def _as_user(app):
    app.dependency_overrides[get_current_user] = lambda: "u-001"
    app.dependency_overrides[get_current_user_optional] = lambda: "u-001"
    yield
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_current_user_optional, None)


def _studio_generated_content(card_id: str) -> dict:
    if card_id == "word_document":
        return {
            "kind": "word_document",
            "title": "牛顿定律学生讲义",
            "summary": "围绕牛顿定律生成分层教学讲义。",
            "document_variant": "student_handout",
            "source_artifact_id": "a-ppt-001",
        }
    return {
        "kind": "mindmap",
        "title": "化学反应速率",
        "nodes": [{"id": "root", "parent_id": None, "title": "化学反应速率"}],
    }


def _animation_runtime_content() -> dict:
    return {
        "kind": "animation_storyboard",
        "topic": "冒泡排序",
        "summary": "解释最大值如何逐轮冒到末尾。",
        "runtime_graph_version": "generic_explainer_graph.v1",
        "runtime_graph": {
            "family_hint": "algorithm_demo",
            "timeline": {"total_steps": 2},
            "steps": [
                {
                    "primary_caption": {"title": "比较", "body": "先比较相邻元素。"},
                    "entities": [{"id": "track-0", "kind": "track_stack"}],
                },
                {
                    "primary_caption": {"title": "交换", "body": "较大的元素向后移动。"},
                    "entities": [{"id": "track-1", "kind": "track_stack"}],
                },
            ],
            "used_primitives": ["AnimationGraphRenderer"],
        },
        "runtime_draft_version": "explainer_draft.v1",
        "runtime_draft": {
            "family_hint": "algorithm_demo",
            "step_captions": [
                {"caption_title": "比较", "caption_body": "先比较相邻元素。"},
                {"caption_title": "交换", "caption_body": "较大的元素向后移动。"},
            ],
        },
        "component_code": (
            "export default function Animation(runtimeProps) {"
            " return React.createElement(AnimationGraphRenderer, { graph: {}, theme: runtimeProps.theme });"
            " }"
        ),
        "runtime_source": "llm_draft_assembled_graph",
        "runtime_contract": "animation_runtime.v4",
        "compile_status": "pending",
        "compile_errors": [],
    }


@pytest.mark.anyio
async def test_execute_studio_card_creates_word_artifact(app, _as_user):
    client = TestClient(app)
    source_artifact = SimpleNamespace(id="a-ppt-001", projectId="p-001", type="pptx")
    artifact = SimpleNamespace(
        id="a-word-001",
        projectId="p-001",
        sessionId=None,
        basedOnVersionId=None,
        ownerUserId="u-001",
        type="docx",
        visibility="private",
        storagePath="uploads/artifacts/a-word-001.docx",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
    )

    with (
        patch(
            "services.project_space_service.project_space_service.check_project_permission",
            AsyncMock(),
        ),
        patch(
            "services.generation_session_service.card_execution_runtime_artifacts.build_studio_tool_artifact_content",
            AsyncMock(return_value=_studio_generated_content("word_document")),
        ),
        patch(
            "services.project_space_service.project_space_service.get_artifact",
            AsyncMock(return_value=source_artifact),
        ),
        patch(
            "services.project_space_service.project_space_service.create_artifact_with_file",
            AsyncMock(return_value=artifact),
        ) as create_artifact_mock,
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/word_document/execute",
            json={
                "project_id": "p-001",
                "source_artifact_id": "a-ppt-001",
                "config": {"document_variant": "student_handout"},
            },
        )

    assert response.status_code == 200
    kwargs = create_artifact_mock.await_args.kwargs
    assert kwargs["artifact_type"] == "docx"
    assert kwargs["content"]["document_variant"] == "student_handout"


@pytest.mark.anyio
async def test_execute_studio_card_strict_mode_returns_upstream_error(app, _as_user):
    client = TestClient(app)

    with (
        patch(
            "services.project_space_service.project_space_service.check_project_permission",
            AsyncMock(),
        ),
        patch(
            "services.generation_session_service.card_execution_runtime_artifacts.build_studio_tool_artifact_content",
            AsyncMock(
                side_effect=APIException(
                    status_code=502,
                    error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                    message="AI generation failed",
                    details={
                        "card_id": "knowledge_mindmap",
                        "phase": "generate",
                        "failure_reason": "provider timeout",
                    },
                )
            ),
        ),
        patch(
            "services.project_space_service.project_space_service.create_artifact_with_file",
            AsyncMock(),
        ) as create_artifact_mock,
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/knowledge_mindmap/execute",
            json={"project_id": "p-001", "config": {"topic": "Electromagnetism"}},
        )

    assert response.status_code == 502
    error_payload = response.json().get("error") or response.json().get("detail") or {}
    details = error_payload.get("details") or {}
    assert details.get("card_id") == "knowledge_mindmap"
    assert details.get("phase") == "generate"
    create_artifact_mock.assert_not_awaited()


@pytest.mark.anyio
async def test_execute_demonstration_animations_creates_runtime_graph_artifact(
    app, _as_user
):
    client = TestClient(app)
    artifact = SimpleNamespace(
        id="a-animation-001",
        projectId="p-001",
        sessionId=None,
        basedOnVersionId=None,
        ownerUserId="u-001",
        type="html",
        visibility="private",
        storagePath="uploads/artifacts/a-animation-001.html",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
    )

    with (
        patch(
            "services.project_space_service.project_space_service.check_project_permission",
            AsyncMock(),
        ),
        patch(
            "services.generation_session_service.card_execution_runtime_artifacts.build_studio_tool_artifact_content",
            AsyncMock(return_value=_animation_runtime_content()),
        ),
        patch(
            "services.project_space_service.project_space_service.create_artifact_with_file",
            AsyncMock(return_value=artifact),
        ) as create_artifact_mock,
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/demonstration_animations/execute",
            json={
                "project_id": "p-001",
                "config": {"topic": "冒泡排序", "motion_brief": "解释交换过程"},
                "visibility": "private",
            },
    )

    assert response.status_code == 200
    kwargs = create_artifact_mock.await_args.kwargs
    assert kwargs["artifact_type"] == "mp4"
    assert kwargs["content"]["runtime_graph_version"] == "generic_explainer_graph.v1"
    assert kwargs["content"]["runtime_draft_version"] == "explainer_draft.v1"
    assert kwargs["content"]["runtime_source"] == "llm_draft_assembled_graph"
    assert kwargs["content"]["component_code"]
    assert kwargs["content"]["render_mode"] == "cloud_video_wan"
    assert kwargs["content"]["format"] == "mp4"
    assert kwargs["content"]["cloud_video_model"] == "wan2.7-i2v"


@pytest.mark.anyio
async def test_execute_demonstration_animations_surfaces_runtime_generation_errors(
    app, _as_user
):
    client = TestClient(app)

    with (
        patch(
            "services.project_space_service.project_space_service.check_project_permission",
            AsyncMock(),
        ),
        patch(
            "services.generation_session_service.card_execution_runtime_artifacts.build_studio_tool_artifact_content",
            AsyncMock(
                side_effect=APIException(
                    status_code=502,
                    error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                    message="Animation runtime draft generation failed",
                    details={
                        "card_id": "demonstration_animations",
                        "phase": "draft_schema",
                        "failure_reason": "runtime_draft_schema_error",
                    },
                )
            ),
        ),
        patch(
            "services.project_space_service.project_space_service.create_artifact_with_file",
            AsyncMock(),
        ) as create_artifact_mock,
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/demonstration_animations/execute",
            json={
                "project_id": "p-001",
                "config": {"topic": "冒泡排序"},
                "visibility": "private",
            },
        )

    assert response.status_code == 502
    error_payload = response.json().get("error") or response.json().get("detail") or {}
    details = error_payload.get("details") or {}
    assert details.get("card_id") == "demonstration_animations"
    assert details.get("failure_reason") == "runtime_draft_schema_error"
    create_artifact_mock.assert_not_awaited()


@pytest.mark.anyio
async def test_classroom_simulator_turn_rejects_non_simulator_artifact(app, _as_user):
    client = TestClient(app)
    artifact = SimpleNamespace(
        id="a-summary-001",
        projectId="p-001",
        type="summary",
        metadata={"kind": "speaker_notes"},
        storagePath="/tmp/speaker.json",
    )

    with (
        patch(
            "services.project_space_service.project_space_service.check_project_permission",
            AsyncMock(),
        ),
        patch(
            "services.project_space_service.project_space_service.get_artifact",
            AsyncMock(return_value=artifact),
        ),
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/classroom_qa_simulator/turn",
            json={
                "project_id": "p-001",
                "artifact_id": "a-summary-001",
                "teacher_answer": "先给结论。",
            },
        )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "INVALID_INPUT"


@pytest.mark.anyio
async def test_classroom_simulator_turn_returns_follow_up_runtime_state(app, _as_user):
    client = TestClient(app)

    with patch(
        "routers.generate_sessions.studio_cards.execute_classroom_simulator_turn",
        AsyncMock(
            return_value=(
                {"id": "a-summary-002", "type": "summary"},
                SimpleNamespace(
                    model_dump=lambda mode="json": {
                        "turn_anchor": "turn-2",
                        "student_profile": "detail_oriented",
                        "student_question": "为什么这一步不能直接合并？",
                        "teacher_answer": "先拆开边界条件。",
                        "feedback": "可以继续追问原因链。",
                        "score": 86,
                        "next_focus": "边界条件",
                    }
                ),
                {
                    "primary_carrier": "hybrid",
                    "active_artifact_id": "a-summary-002",
                    "can_refine": True,
                    "can_follow_up_turn": True,
                    "source_binding_valid": True,
                    "next_action": "follow_up_turn",
                },
            )
        ),
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/classroom_qa_simulator/turn",
            json={
                "project_id": "p-001",
                "artifact_id": "a-summary-001",
                "teacher_answer": "先拆开边界条件。",
            },
        )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["turn_result"]["turn_anchor"] == "turn-2"
    assert payload["latest_runnable_state"]["next_action"] == "follow_up_turn"
    assert payload["turn_anchor"] == "turn-2"
    assert payload["next_focus"] == "边界条件"
