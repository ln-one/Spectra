from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import routers.generate_sessions.preview as generate_sessions_preview_router
from main import app
from services.generation_session_service import GenerationSessionService
from services.platform.state_transition_guard import GenerationState
from utils.dependencies import get_current_user

_USER_ID = "u-preview-001"


@pytest.fixture()
def _as_user():
    app.dependency_overrides[get_current_user] = lambda: _USER_ID
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _snapshot(render_version: int = 3, state: str = GenerationState.SUCCESS.value):
    return {
        "session": {
            "session_id": "s-preview-001",
            "project_id": "p-preview-001",
            "state": state,
            "render_version": render_version,
        },
        "result": {
            "ppt_url": "uploads/ppt/demo.pptx",
            "word_url": "uploads/doc/demo.docx",
            "version": render_version,
        },
    }


def _preview_session_model(
    *,
    session_id: str = "s-preview-001",
    user_id: str = _USER_ID,
    state: str = GenerationState.FAILED.value,
):
    return SimpleNamespace(
        id=session_id,
        projectId="p-preview-001",
        userId=user_id,
        baseVersionId=None,
        state=state,
        stateReason="task_failed_permanent_error",
        progress=0,
        resumable=True,
        updatedAt=datetime.now(timezone.utc),
        renderVersion=1,
        options=None,
        pptUrl=None,
        wordUrl=None,
        displayTitle=None,
        displayTitleSource=None,
        displayTitleUpdatedAt=None,
    )


def test_get_preview_includes_artifact_binding(client, monkeypatch, _as_user):
    svc = SimpleNamespace(get_session_snapshot=AsyncMock(return_value=_snapshot()))
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-001", basedOnVersionId="v-001")),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        AsyncMock(
            return_value=(
                SimpleNamespace(id="t-001"),
                [],
                None,
                {
                    "rendered_preview": {
                        "format": "png",
                        "page_count": 1,
                        "pages": [
                            {
                                "index": 0,
                                "slide_id": "slide-1",
                                "image_url": "data:image/png;base64,abc",
                            }
                        ],
                    }
                },
            )
        ),
    )

    resp = client.get(
        "/api/v1/generate/sessions/s-preview-001/preview?artifact_id=a-001"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["artifact_id"] == "a-001"
    assert body["data"]["based_on_version_id"] == "v-001"
    assert body["data"]["rendered_preview"]["pages"][0]["slide_id"] == "slide-1"


def test_get_preview_includes_slide_image_metadata(client, monkeypatch, _as_user):
    svc = SimpleNamespace(get_session_snapshot=AsyncMock(return_value=_snapshot()))
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-001", basedOnVersionId="v-001")),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        AsyncMock(
            return_value=(
                SimpleNamespace(id="t-001"),
                [
                    {
                        "id": "slide-1",
                        "index": 0,
                        "title": "S1",
                        "content": "C1",
                        "sources": [],
                        "image_metadata": {
                            "retrieval_mode": "default_library",
                            "page_semantic_type": "priority",
                            "image_insertion_decision": "insert",
                            "image_count": 1,
                            "image_slot": "bottom_panel",
                            "layout_risk_level": "low",
                            "image_match_reason": "RAG matched: demo.png",
                        },
                    }
                ],
                None,
                {},
            )
        ),
    )

    resp = client.get("/api/v1/generate/sessions/s-preview-001/preview")
    assert resp.status_code == 200
    slide = resp.json()["data"]["slides"][0]
    assert slide["image_metadata"]["image_insertion_decision"] == "insert"
    assert slide["image_metadata"]["image_slot"] == "bottom_panel"


def test_get_preview_prefers_lightweight_snapshot_when_available(
    client, monkeypatch, _as_user
):
    preview_snapshot = AsyncMock(return_value=_snapshot())
    full_snapshot = AsyncMock(return_value=_snapshot())
    svc = SimpleNamespace(
        get_session_preview_snapshot=preview_snapshot,
        get_session_snapshot=full_snapshot,
    )
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-001", basedOnVersionId="v-001")),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        AsyncMock(return_value=(SimpleNamespace(id="t-001"), [], None, {})),
    )

    resp = client.get("/api/v1/generate/sessions/s-preview-001/preview")
    assert resp.status_code == 200
    preview_snapshot.assert_awaited_once_with("s-preview-001", _USER_ID)
    full_snapshot.assert_not_awaited()


def test_get_preview_with_run_id_returns_run_not_ready_when_no_task(
    client, monkeypatch, _as_user
):
    svc = SimpleNamespace(get_session_snapshot=AsyncMock(return_value=_snapshot()))
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        AsyncMock(return_value=(None, [], None, {})),
    )

    resp = client.get("/api/v1/generate/sessions/s-preview-001/preview?run_id=run-001")
    assert resp.status_code == 409
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "RESOURCE_CONFLICT"
    assert body["error"]["details"]["reason"] == "run_not_ready"
    assert body["error"]["details"]["run_id"] == "run-001"


def test_get_preview_with_run_id_supports_prisma_without_select(
    client, monkeypatch, _as_user
):
    async def _find_unique(**kwargs):
        assert kwargs == {"where": {"id": "s-preview-001"}}
        return _preview_session_model()

    service = GenerationSessionService(
        db=SimpleNamespace(
            generationsession=SimpleNamespace(
                find_unique=AsyncMock(side_effect=_find_unique)
            ),
            generationtask=SimpleNamespace(find_first=AsyncMock(return_value=None)),
            artifact=SimpleNamespace(find_first=AsyncMock(return_value=None)),
        )
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_get_session_service",
        lambda: service,
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-010", basedOnVersionId=None)),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        AsyncMock(
            return_value=(
                SimpleNamespace(id="t-010"),
                [
                    {
                        "id": "slide-1",
                        "index": 0,
                        "title": "S1",
                        "content": "C1",
                        "sources": [],
                    }
                ],
                None,
                {},
            )
        ),
    )

    resp = client.get("/api/v1/generate/sessions/s-preview-001/preview?run_id=run-010")

    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["artifact_id"] == "a-010"
    assert body["data"]["artifact_anchor"]["run_id"] == "run-010"


def test_modify_preview_returns_contract_fields(client, monkeypatch, _as_user):
    load_preview_material = AsyncMock(
        return_value=(
            SimpleNamespace(id="t-001"),
            [
                {
                    "id": "slide-1",
                    "index": 0,
                    "title": "S1",
                    "content": "C1",
                    "sources": [],
                }
            ],
            None,
            {},
        )
    )
    svc = SimpleNamespace(
        get_session_snapshot=AsyncMock(return_value=_snapshot(render_version=5)),
        execute_command=AsyncMock(return_value={}),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-002", basedOnVersionId="v-002")),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        load_preview_material,
    )

    resp = client.post(
        "/api/v1/generate/sessions/s-preview-001/preview/modify",
        json={
            "run_id": "run-002",
            "slide_id": "slide-1",
            "slide_index": 1,
            "instruction": "请把当前页标题改得更清晰",
            "patch": {"title": "new title"},
            "scope": "current_slide_only",
            "preserve_style": False,
            "preserve_layout": False,
            "preserve_deck_consistency": False,
            "artifact_id": "a-002",
        },
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["session_id"] == "s-preview-001"
    assert "modify_task_id" not in data
    assert data["artifact_id"] == "a-002"
    assert data["based_on_version_id"] == "v-002"
    assert data["render_version"] == 5
    assert data["slide_id"] == "slide-1"
    assert data["slide_index"] == 1
    assert data["scope"] == "current_slide_only"
    command = svc.execute_command.await_args.kwargs["command"]
    assert command["preserve_style"] is False
    assert command["preserve_layout"] is False
    assert command["preserve_deck_consistency"] is False
    assert command["patch"] == {"title": "new title"}
    assert load_preview_material.await_args.args[3] == "run-002"


def test_modify_preview_accepts_base_render_version_alias(
    client, monkeypatch, _as_user
):
    execute_command = AsyncMock(return_value={})
    svc = SimpleNamespace(
        get_session_snapshot=AsyncMock(return_value=_snapshot(render_version=5)),
        execute_command=execute_command,
    )
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-002", basedOnVersionId="v-002")),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        AsyncMock(
            return_value=(
                SimpleNamespace(id="t-001"),
                [
                    {
                        "id": "slide-1",
                        "index": 0,
                        "title": "S1",
                        "content": "C1",
                        "sources": [],
                    }
                ],
                None,
                {},
            )
        ),
    )

    resp = client.post(
        "/api/v1/generate/sessions/s-preview-001/preview/modify",
        json={
            "slide_id": "slide-1",
            "instruction": "把第1页改成问题导入",
            "patch": {"title": "new title"},
            "artifact_id": "a-002",
            "base_render_version": 3,
        },
    )
    assert resp.status_code == 200
    command = execute_command.await_args.kwargs["command"]
    assert command["expected_render_version"] == 3


def test_modify_preview_defaults_to_current_slide_when_page_not_passed(
    client, monkeypatch, _as_user
):
    execute_command = AsyncMock(return_value={})
    svc = SimpleNamespace(
        get_session_snapshot=AsyncMock(return_value=_snapshot(render_version=6)),
        execute_command=execute_command,
    )
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-003", basedOnVersionId="v-003")),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        AsyncMock(
            return_value=(
                SimpleNamespace(id="t-002"),
                [
                    {
                        "id": "slide-1",
                        "index": 0,
                        "title": "S1",
                        "content": "C1",
                        "sources": [],
                    },
                    {
                        "id": "slide-2",
                        "index": 1,
                        "title": "S2",
                        "content": "C2",
                        "sources": [],
                    },
                ],
                None,
                {},
            )
        ),
    )

    resp = client.post(
        "/api/v1/generate/sessions/s-preview-001/preview/modify",
        json={
            "instruction": "把这一页改成课堂提问风格",
            "artifact_id": "a-003",
        },
    )
    assert resp.status_code == 200
    command = execute_command.await_args.kwargs["command"]
    assert command["slide_id"] == "slide-1"
    assert command["slide_index"] == 1
    assert command["instruction"] == "把这一页改成课堂提问风格"


def test_modify_preview_rejects_conflicting_render_versions(client, _as_user):
    resp = client.post(
        "/api/v1/generate/sessions/s-preview-001/preview/modify",
        json={
            "slide_id": "slide-1",
            "instruction": "改标题",
            "patch": {"title": "new title"},
            "base_render_version": 3,
            "expected_render_version": 4,
        },
    )

    assert resp.status_code == 400
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INVALID_INPUT"


def test_modify_preview_requires_instruction(client, monkeypatch, _as_user):
    svc = SimpleNamespace(
        get_session_snapshot=AsyncMock(return_value=_snapshot(render_version=5)),
        execute_command=AsyncMock(return_value={}),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-002", basedOnVersionId="v-002")),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        AsyncMock(
            return_value=(
                SimpleNamespace(id="t-001"),
                [
                    {
                        "id": "slide-1",
                        "index": 0,
                        "title": "S1",
                        "content": "C1",
                        "sources": [],
                    }
                ],
                None,
                {},
            )
        ),
    )

    resp = client.post(
        "/api/v1/generate/sessions/s-preview-001/preview/modify",
        json={"slide_id": "slide-1", "patch": {"title": "new title"}},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_INPUT"


def test_get_slide_preview_returns_slide_shape(client, monkeypatch, _as_user):
    svc = SimpleNamespace(get_session_snapshot=AsyncMock(return_value=_snapshot()))
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-003", basedOnVersionId=None)),
    )
    slides = [
        {"id": "slide-1", "index": 0, "title": "S1", "content": "C1", "sources": []},
        {"id": "slide-2", "index": 1, "title": "S2", "content": "C2", "sources": []},
    ]
    lesson_plan = {
        "teaching_objectives": [],
        "slides_plan": [
            {
                "slide_id": "slide-2",
                "teaching_goal": "g",
                "teacher_script": "s",
                "material_sources": [],
            }
        ],
    }
    load_preview_material = AsyncMock(
        return_value=(
            SimpleNamespace(id="t-003"),
            slides,
            lesson_plan,
            {
                "rendered_preview": {
                    "pages": [
                        {
                            "index": 1,
                            "slide_id": "slide-2",
                            "image_url": "data:image/png;base64,slide2",
                        }
                    ]
                }
            },
        )
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        load_preview_material,
    )

    resp = client.get(
        "/api/v1/generate/sessions/s-preview-001/preview/slides/slide-2?run_id=run-003"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["slide"]["id"] == "slide-2"
    assert body["data"]["teaching_plan"]["slide_id"] == "slide-2"
    assert body["data"]["artifact_id"] == "a-003"
    assert body["data"]["artifact_anchor"]["run_id"] == "run-003"
    assert body["data"]["rendered_page"]["slide_id"] == "slide-2"
    assert load_preview_material.await_args.args[3] == "run-003"


def test_get_slide_preview_with_run_id_supports_prisma_without_select(
    client, monkeypatch, _as_user
):
    async def _find_unique(**kwargs):
        assert kwargs == {"where": {"id": "s-preview-001"}}
        return _preview_session_model()

    service = GenerationSessionService(
        db=SimpleNamespace(
            generationsession=SimpleNamespace(
                find_unique=AsyncMock(side_effect=_find_unique)
            ),
            generationtask=SimpleNamespace(find_first=AsyncMock(return_value=None)),
            artifact=SimpleNamespace(find_first=AsyncMock(return_value=None)),
        )
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_get_session_service",
        lambda: service,
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-011", basedOnVersionId=None)),
    )
    load_preview_material = AsyncMock(
        return_value=(
            SimpleNamespace(id="t-011"),
            [
                {
                    "id": "slide-1",
                    "index": 0,
                    "title": "S1",
                    "content": "C1",
                    "sources": [],
                }
            ],
            None,
            {},
        )
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        load_preview_material,
    )

    resp = client.get(
        "/api/v1/generate/sessions/s-preview-001/preview/slides/slide-1?run_id=run-011"
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["artifact_id"] == "a-011"
    assert body["data"]["artifact_anchor"]["run_id"] == "run-011"
    assert load_preview_material.await_args.args[3] == "run-011"


def test_export_preview_expected_render_version_conflict(client, monkeypatch, _as_user):
    svc = SimpleNamespace(
        get_session_snapshot=AsyncMock(return_value=_snapshot(render_version=4))
    )
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )

    resp = client.post(
        "/api/v1/generate/sessions/s-preview-001/preview/export",
        json={"format": "markdown", "expected_render_version": 5},
    )
    assert resp.status_code == 409
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "RESOURCE_CONFLICT"
    assert body["error"]["retryable"] is False
    assert body["error"]["trace_id"]


def test_export_preview_requires_format(client, monkeypatch, _as_user):
    svc = SimpleNamespace(
        get_session_snapshot=AsyncMock(return_value=_snapshot(render_version=4))
    )
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )

    resp = client.post(
        "/api/v1/generate/sessions/s-preview-001/preview/export", json={}
    )

    assert resp.status_code == 400
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INVALID_INPUT"


def test_export_preview_returns_binding_and_content(client, monkeypatch, _as_user):
    svc = SimpleNamespace(
        get_session_snapshot=AsyncMock(return_value=_snapshot(render_version=7))
    )
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-004", basedOnVersionId="v-007")),
    )
    load_preview_material = AsyncMock(
        return_value=(
            SimpleNamespace(id="t-007"),
            [
                {
                    "id": "slide-1",
                    "index": 0,
                    "title": "S1",
                    "content": "C1",
                    "sources": [],
                }
            ],
            {"teaching_objectives": [], "slides_plan": []},
            {"markdown_content": "# Demo"},
        )
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        load_preview_material,
    )

    resp = client.post(
        "/api/v1/generate/sessions/s-preview-001/preview/export",
        json={"format": "markdown", "artifact_id": "a-004", "run_id": "run-007"},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["artifact_id"] == "a-004"
    assert data["based_on_version_id"] == "v-007"
    assert "task_id" not in data
    assert data["format"] == "markdown"
    assert data["render_version"] == 7
    assert data["content"] == "# Demo"
    assert data["artifact_anchor"]["run_id"] == "run-007"
    assert load_preview_material.await_args.args[3] == "run-007"
