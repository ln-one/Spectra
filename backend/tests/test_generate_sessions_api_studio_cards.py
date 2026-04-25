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
            "kind": "teaching_document",
            "legacy_kind": "word_document",
            "schema_id": "lesson_plan_v1",
            "schema_version": 1,
            "preset": "lesson_plan",
            "title": "牛顿定律教案",
            "summary": "围绕牛顿定律生成教案。",
            "document_variant": "layered_lesson_plan",
            "source_artifact_id": "a-ppt-001",
        }
    if card_id == "interactive_games":
        return {
            "kind": "interactive_game",
            "schema_id": "interactive_game.v2",
            "subtype": "drag_classification",
            "title": "电路术语配对",
            "summary": "把关键术语和定义快速配对。",
            "subtitle": "通过拖拽完成归类",
            "teaching_goal": "区分基础电路概念",
            "teacher_notes": ["教师先口头说明分类标准。"],
            "instructions": ["拖动卡片到正确区域。", "完成后点击检查答案。"],
            "spec": {
                "items": [
                    {"id": "item-1", "label": "串联"},
                    {"id": "item-2", "label": "并联"},
                    {"id": "item-3", "label": "支路"},
                ],
                "zones": [
                    {"id": "zone-1", "label": "连接方式"},
                    {"id": "zone-2", "label": "结构特征"},
                ],
                "correct_mapping": {
                    "item-1": "zone-1",
                    "item-2": "zone-1",
                    "item-3": "zone-2",
                },
                "feedback_copy": {
                    "correct": "归类正确。",
                    "incorrect": "还有卡片放错了位置。",
                },
            },
            "score_policy": {"max_score": 100, "timer_seconds": 90},
            "completion_rule": {
                "pass_threshold": 1.0,
                "success_copy": "完成得很漂亮。",
                "failure_copy": "再试一次。",
            },
            "answer_key": {
                "subtype": "drag_classification",
                "correct_mapping": {
                    "item-1": "zone-1",
                    "item-2": "zone-1",
                    "item-3": "zone-2",
                },
            },
            "runtime": {
                "html": "<html><body><main><h1>demo</h1></main></body></html>",
                "sandbox_version": "interactive_game_sandbox.v1",
                "assets": [],
            },
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
            "services.generation_session_service.card_execution_runtime_artifacts.resolve_execution_session_id",
            AsyncMock(return_value="s-001"),
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
                "client_session_id": "s-001",
                "primary_source_id": "a-ppt-001",
                "source_artifact_id": "a-ppt-001",
                "selected_source_ids": ["a-ppt-001"],
                "config": {
                    "schema_id": "lesson_plan_v1",
                    "detail_level": "standard",
                },
            },
        )

    assert response.status_code == 200
    kwargs = create_artifact_mock.await_args.kwargs
    assert kwargs["artifact_type"] == "docx"
    assert kwargs["content"]["kind"] == "teaching_document"
    assert kwargs["content"]["schema_id"] == "lesson_plan_v1"
    assert kwargs["content"]["primary_source_id"] == "a-ppt-001"
    assert kwargs["session_id"] == "s-001"


@pytest.mark.anyio
async def test_execute_studio_card_creates_word_artifact_without_ppt_source(
    app, _as_user
):
    client = TestClient(app)
    artifact = SimpleNamespace(
        id="a-word-002",
        projectId="p-001",
        sessionId=None,
        basedOnVersionId=None,
        ownerUserId="u-001",
        type="docx",
        visibility="private",
        storagePath="uploads/artifacts/a-word-002.docx",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
    )
    generated_content = _studio_generated_content("word_document")
    generated_content.pop("source_artifact_id", None)
    generated_content["title"] = "物理层的基本概念教案"

    with (
        patch(
            "services.project_space_service.project_space_service.check_project_permission",
            AsyncMock(),
        ),
        patch(
            "services.generation_session_service.card_execution_runtime_artifacts.resolve_execution_session_id",
            AsyncMock(return_value="s-001"),
        ),
        patch(
            "services.generation_session_service.card_execution_runtime_artifacts.build_studio_tool_artifact_content",
            AsyncMock(return_value=generated_content),
        ),
        patch(
            "services.project_space_service.project_space_service.get_artifact",
            AsyncMock(),
        ) as get_artifact_mock,
        patch(
            "services.project_space_service.project_space_service.create_artifact_with_file",
            AsyncMock(return_value=artifact),
        ) as create_artifact_mock,
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/word_document/execute",
            json={
                "project_id": "p-001",
                "client_session_id": "s-001",
                "config": {
                    "schema_id": "lesson_plan_v1",
                    "topic": "物理层的基本概念",
                    "detail_level": "standard",
                },
            },
        )

    assert response.status_code == 200
    get_artifact_mock.assert_not_awaited()
    kwargs = create_artifact_mock.await_args.kwargs
    assert kwargs["artifact_type"] == "docx"
    assert kwargs["content"]["kind"] == "teaching_document"
    assert kwargs["content"]["primary_source_id"] is None
    assert kwargs["content"]["source_snapshot"]["source_artifact_id"] is None
    assert kwargs["content"]["latest_runnable_state"]["source_binding_valid"] is True


@pytest.mark.anyio
async def test_execute_word_document_requires_client_session_id(app, _as_user):
    client = TestClient(app)

    response = client.post(
        "/api/v1/generate/studio-cards/word_document/execute",
        json={
            "project_id": "p-001",
            "config": {
                "schema_id": "lesson_plan_v1",
                "topic": "物理层的基本概念",
            },
        },
    )

    assert response.status_code == 409
    payload = response.json()
    detail = payload.get("detail") or payload.get("error") or {}
    assert detail.get("code") == "RESOURCE_CONFLICT"


@pytest.mark.anyio
async def test_execute_interactive_games_persists_interactive_game_v2_snapshot(
    app, _as_user
):
    client = TestClient(app)
    artifact = SimpleNamespace(
        id="a-game-001",
        projectId="p-001",
        sessionId=None,
        basedOnVersionId=None,
        ownerUserId="u-001",
        type="html",
        visibility="private",
        storagePath="uploads/artifacts/a-game-001.html",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
    )

    with (
        patch(
            "services.project_space_service.project_space_service.check_project_permission",
            AsyncMock(),
        ),
        patch(
            "services.generation_session_service.card_execution_runtime_artifacts.resolve_execution_session_id",
            AsyncMock(return_value="s-001"),
        ),
        patch(
            "services.generation_session_service.card_execution_runtime_artifacts.build_studio_tool_artifact_content",
            AsyncMock(return_value=_studio_generated_content("interactive_games")),
        ),
        patch(
            "services.project_space_service.project_space_service.create_artifact_with_file",
            AsyncMock(return_value=artifact),
        ) as create_artifact_mock,
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/interactive_games/execute",
            json={
                "project_id": "p-001",
                "client_session_id": "s-001",
                "config": {
                    "topic": "电路基础",
                    "teaching_goal": "让学生区分串联和并联",
                    "interaction_brief": "更偏向拖拽归类",
                },
            },
        )

    assert response.status_code == 200
    kwargs = create_artifact_mock.await_args.kwargs
    assert kwargs["artifact_type"] == "html"
    assert kwargs["content"]["schema_id"] == "interactive_game.v2"
    assert kwargs["content"]["runtime"]["sandbox_version"] == "interactive_game_sandbox.v1"


@pytest.mark.anyio
async def test_execute_studio_card_strict_mode_returns_upstream_error(app, _as_user):
    client = TestClient(app)

    with (
        patch(
            "services.project_space_service.project_space_service.check_project_permission",
            AsyncMock(),
        ),
        patch(
            "services.generation_session_service.card_execution_runtime_artifacts.resolve_execution_session_id",
            AsyncMock(return_value="s-001"),
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
            json={
                "project_id": "p-001",
                "client_session_id": "s-001",
                "config": {"topic": "Electromagnetism"},
            },
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
        type="gif",
        visibility="private",
        storagePath="uploads/artifacts/a-animation-001.gif",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
    )

    with (
        patch(
            "services.project_space_service.project_space_service.check_project_permission",
            AsyncMock(),
        ),
        patch(
            "services.generation_session_service.card_execution_runtime_artifacts.resolve_execution_session_id",
            AsyncMock(return_value="s-001"),
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
                "client_session_id": "s-001",
                "config": {"topic": "冒泡排序", "motion_brief": "解释交换过程"},
                "visibility": "private",
            },
    )

    assert response.status_code == 200
    kwargs = create_artifact_mock.await_args.kwargs
    assert kwargs["artifact_type"] == "html"
    assert kwargs["content"]["runtime_graph_version"] == "generic_explainer_graph.v1"
    assert kwargs["content"]["runtime_draft_version"] == "explainer_draft.v1"
    assert kwargs["content"]["runtime_source"] == "llm_draft_assembled_graph"
    assert kwargs["content"]["component_code"]
    assert kwargs["content"]["render_mode"] == "html5"
    assert kwargs["content"]["format"] == "html5"
    assert "cloud_video_model" not in kwargs["content"]


@pytest.mark.anyio
async def test_animation_execution_preview_rejects_mp4_with_problem_details(
    app, _as_user
):
    client = TestClient(app)

    response = client.post(
        "/api/v1/generate/studio-cards/demonstration_animations/execution-preview",
        json={
            "project_id": "p-001",
            "config": {
                "topic": "冒泡排序",
                "animation_format": "mp4",
            },
        },
    )

    assert response.status_code == 400
    assert response.headers["content-type"].startswith("application/problem+json")
    payload = response.json()
    assert payload["type"] == "https://spectra.dev/problems/animation-format-not-supported"
    assert payload["title"] == "Animation format is not supported"
    assert payload["status"] == 400
    assert payload["instance"] == (
        "/api/v1/generate/studio-cards/"
        "demonstration_animations/execution-preview"
    )
    assert payload["error_code"] == "INVALID_ANIMATION_FORMAT"
    assert payload["allowed_formats"] == ["gif", "html5"]
    assert payload["invalid_field"] == "animation_format"
    assert payload["invalid_value"] == "mp4"


@pytest.mark.anyio
async def test_execute_demonstration_animations_rejects_cloud_video_mode_with_problem_details(
    app, _as_user
):
    client = TestClient(app)

    response = client.post(
        "/api/v1/generate/studio-cards/demonstration_animations/execute",
        json={
            "project_id": "p-001",
            "client_session_id": "s-001",
            "config": {
                "topic": "冒泡排序",
                "render_mode": "cloud_video_wan",
            },
        },
    )

    assert response.status_code == 400
    assert response.headers["content-type"].startswith("application/problem+json")
    payload = response.json()
    assert payload["error_code"] == "INVALID_ANIMATION_FORMAT"
    assert payload["invalid_field"] == "render_mode"
    assert payload["invalid_value"] == "cloud_video_wan"
    assert payload["allowed_formats"] == ["gif", "html5"]


@pytest.mark.anyio
async def test_refine_demonstration_animations_rejects_mp4_with_problem_details(
    app, _as_user
):
    client = TestClient(app)

    response = client.post(
        "/api/v1/generate/studio-cards/demonstration_animations/refine",
        json={
            "project_id": "p-001",
            "artifact_id": "a-animation-001",
            "refine_mode": "structured_refine",
            "config": {"animation_format": "mp4"},
        },
    )

    assert response.status_code == 400
    assert response.headers["content-type"].startswith("application/problem+json")
    payload = response.json()
    assert payload["error_code"] == "INVALID_ANIMATION_FORMAT"
    assert payload["invalid_field"] == "animation_format"
    assert payload["invalid_value"] == "mp4"
    assert payload["allowed_formats"] == ["gif", "html5"]


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
            "services.generation_session_service.card_execution_runtime_artifacts.resolve_execution_session_id",
            AsyncMock(return_value="s-001"),
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
                "client_session_id": "s-001",
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


@pytest.mark.anyio
async def test_recommend_animation_placement_updates_gif_artifact_metadata(app, _as_user):
    client = TestClient(app)
    animation_artifact = SimpleNamespace(
        id="a-animation-001",
        projectId="p-001",
        sessionId="sess-animation",
        type="gif",
        metadata={
            "kind": "animation_storyboard",
            "topic": "冒泡排序",
            "summary": "解释交换过程",
            "content_snapshot": {"kind": "animation_storyboard", "placements": []},
        },
        updatedAt=datetime.now(timezone.utc),
    )
    ppt_artifact = SimpleNamespace(
        id="a-ppt-001",
        projectId="p-001",
        sessionId="sess-ppt",
        type="pptx",
        metadata={"slide_count": 6},
        updatedAt=datetime.now(timezone.utc),
    )

    with (
        patch(
            "services.project_space_service.project_space_service.check_project_permission",
            AsyncMock(),
        ),
        patch(
            "services.project_space_service.project_space_service.get_artifact",
            AsyncMock(side_effect=[animation_artifact, ppt_artifact]),
        ),
        patch(
            "services.project_space_service.project_space_service.update_artifact_metadata",
            AsyncMock(),
        ) as update_artifact_mock,
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/demonstration_animations/recommend-placement",
            json={
                "project_id": "p-001",
                "artifact_id": "a-animation-001",
                "ppt_artifact_id": "a-ppt-001",
            },
        )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["recommendation"]["ppt_artifact_id"] == "a-ppt-001"
    assert payload["artifact"]["id"] == "a-animation-001"
    kwargs = update_artifact_mock.await_args.kwargs
    assert kwargs["artifact_id"] == "a-animation-001"
    assert kwargs["metadata"]["placement_recommendation"]["ppt_artifact_id"] == "a-ppt-001"


@pytest.mark.anyio
async def test_confirm_animation_placement_records_binding_for_gif_artifact(app, _as_user):
    client = TestClient(app)
    animation_artifact = SimpleNamespace(
        id="a-animation-001",
        projectId="p-001",
        sessionId="sess-animation",
        type="gif",
        metadata={
            "kind": "animation_storyboard",
            "content_snapshot": {"kind": "animation_storyboard", "placements": []},
        },
        updatedAt=datetime.now(timezone.utc),
    )
    ppt_artifact = SimpleNamespace(
        id="a-ppt-001",
        projectId="p-001",
        sessionId="sess-ppt",
        type="pptx",
        metadata={},
        updatedAt=datetime.now(timezone.utc),
    )

    with (
        patch(
            "services.project_space_service.project_space_service.check_project_permission",
            AsyncMock(),
        ),
        patch(
            "services.project_space_service.project_space_service.get_artifact",
            AsyncMock(side_effect=[animation_artifact, ppt_artifact]),
        ),
        patch(
            "services.project_space_service.project_space_service.update_artifact_metadata",
            AsyncMock(),
        ) as update_artifact_mock,
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/demonstration_animations/confirm-placement",
            json={
                "project_id": "p-001",
                "artifact_id": "a-animation-001",
                "ppt_artifact_id": "a-ppt-001",
                "page_numbers": [2],
                "slot": "right-panel",
            },
        )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["placements"][0]["page_number"] == 2
    assert payload["ppt_artifact"]["id"] == "a-ppt-001"
    assert update_artifact_mock.await_count == 2
    animation_update = update_artifact_mock.await_args_list[0].kwargs
    ppt_update = update_artifact_mock.await_args_list[1].kwargs
    assert animation_update["metadata"]["placements"][0]["slot"] == "right-panel"
    assert (
        ppt_update["metadata"]["embedded_animations"][0]["animation_artifact_id"]
        == "a-animation-001"
    )


@pytest.mark.anyio
async def test_recommend_animation_placement_rejects_html_artifact_with_problem_details(
    app, _as_user
):
    client = TestClient(app)
    animation_artifact = SimpleNamespace(
        id="a-animation-002",
        projectId="p-001",
        sessionId="sess-animation",
        type="html",
        metadata={"kind": "animation_storyboard"},
        updatedAt=datetime.now(timezone.utc),
    )

    with (
        patch(
            "services.project_space_service.project_space_service.check_project_permission",
            AsyncMock(),
        ),
        patch(
            "services.project_space_service.project_space_service.get_artifact",
            AsyncMock(return_value=animation_artifact),
        ),
        patch(
            "services.project_space_service.project_space_service.update_artifact_metadata",
            AsyncMock(),
        ) as update_artifact_mock,
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/demonstration_animations/recommend-placement",
            json={
                "project_id": "p-001",
                "artifact_id": "a-animation-002",
                "ppt_artifact_id": "a-ppt-001",
            },
        )

    assert response.status_code == 400
    assert response.headers["content-type"].startswith("application/problem+json")
    payload = response.json()
    assert payload["error_code"] == "ANIMATION_PLACEMENT_FORMAT_NOT_SUPPORTED"
    assert payload["invalid_field"] == "animation_format"
    assert payload["invalid_value"] == "html5"
    assert payload["allowed_formats"] == ["gif"]
    update_artifact_mock.assert_not_awaited()


@pytest.mark.anyio
async def test_confirm_animation_placement_rejects_non_gif_artifact_with_problem_details(
    app, _as_user
):
    client = TestClient(app)
    animation_artifact = SimpleNamespace(
        id="a-animation-002",
        projectId="p-001",
        sessionId="sess-animation",
        type="mp4",
        metadata={"kind": "animation_storyboard"},
        updatedAt=datetime.now(timezone.utc),
    )

    with (
        patch(
            "services.project_space_service.project_space_service.check_project_permission",
            AsyncMock(),
        ),
        patch(
            "services.project_space_service.project_space_service.get_artifact",
            AsyncMock(return_value=animation_artifact),
        ),
        patch(
            "services.project_space_service.project_space_service.update_artifact_metadata",
            AsyncMock(),
        ) as update_artifact_mock,
    ):
        response = client.post(
            "/api/v1/generate/studio-cards/demonstration_animations/confirm-placement",
            json={
                "project_id": "p-001",
                "artifact_id": "a-animation-002",
                "ppt_artifact_id": "a-ppt-001",
                "page_numbers": [2],
                "slot": "right-panel",
            },
        )

    assert response.status_code == 400
    assert response.headers["content-type"].startswith("application/problem+json")
    payload = response.json()
    assert payload["error_code"] == "ANIMATION_PLACEMENT_FORMAT_NOT_SUPPORTED"
    assert payload["invalid_field"] == "animation_format"
    assert payload["invalid_value"] == "mp4"
    assert payload["allowed_formats"] == ["gif"]
    update_artifact_mock.assert_not_awaited()
