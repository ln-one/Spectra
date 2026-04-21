from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import routers.generate_sessions.preview as generate_sessions_preview_router
from main import app
from services.generation_session_service import GenerationSessionService
from services.platform.state_transition_guard import GenerationState
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ErrorCode

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
        "current_version_id": "v-current",
        "upstream_updated": True,
        "result": {
            "ppt_url": "uploads/ppt/demo.pptx",
            "word_url": "uploads/doc/demo.docx",
            "version": render_version,
        },
    }


def _ppt_snapshot(render_version: int = 3, state: str = GenerationState.SUCCESS.value):
    snapshot = _snapshot(render_version=render_version, state=state)
    snapshot["current_run"] = {"tool_type": "studio_card:courseware_ppt"}
    return snapshot


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
                        "format": "svg",
                        "page_count": 1,
                        "pages": [
                            {
                                "index": 0,
                                "slide_id": "slide-1",
                                "format": "svg",
                                "svg_data_url": "data:image/svg+xml;base64,abc",
                                "preview": {
                                    "index": 0,
                                    "slide_id": "slide-1",
                                    "format": "svg",
                                    "svg_data_url": "data:image/svg+xml;base64,abc",
                                },
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
    assert body["data"]["current_version_id"] == "v-current"
    assert body["data"]["upstream_updated"] is True
    assert body["data"]["rendered_preview"]["pages"][0]["slide_id"] == "slide-1"
    assert body["data"]["authority_preview"]["provider"] == "pagevra"
    authority_slide = body["data"]["authority_preview"]["slides"][0]
    assert authority_slide["slide_id"] == "slide-1"
    assert authority_slide["svg_data_url"] == "data:image/svg+xml;base64,abc"
    assert authority_slide["frames"][0]["slide_id"] == "slide-1"
    assert (
        authority_slide["frames"][0]["svg_data_url"] == "data:image/svg+xml;base64,abc"
    )


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
        execute_command=AsyncMock(return_value={"task_id": "gt-001"}),
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
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["artifact_id"] == "a-002"
    assert body["data"]["slide_id"] == "slide-1"
    assert body["data"]["slide_index"] == 1
    assert body["data"]["scope"] == "current_slide_only"
    load_preview_material.assert_awaited_once()
    svc.execute_command.assert_awaited_once()
    command = svc.execute_command.await_args.kwargs["command"]
    assert command["command_type"] == "REGENERATE_SLIDE"
    assert command["run_id"] == "run-002"
    assert command["slide_id"] == "slide-1"
    assert command["slide_index"] == 1
    assert command["expected_render_version"] is None
    assert command["preserve_style"] is False
    assert command["preserve_layout"] is False
    assert command["preserve_deck_consistency"] is False
    assert "patch" not in command


def test_modify_preview_accepts_base_render_version_alias(
    client, monkeypatch, _as_user
):
    execute_command = AsyncMock(return_value={"task_id": "gt-001"})
    svc = SimpleNamespace(
        get_session_snapshot=AsyncMock(return_value=_snapshot(render_version=3)),
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
    body = resp.json()
    assert body["success"] is True
    execute_command.assert_awaited_once()
    command = execute_command.await_args.kwargs["command"]
    assert command["slide_id"] == "slide-1"
    assert command["slide_index"] == 1
    assert command["expected_render_version"] == 3


def test_modify_preview_accepts_authority_slide_id_suffix(
    client, monkeypatch, _as_user
):
    execute_command = AsyncMock(return_value={"task_id": "gt-004"})
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
        AsyncMock(return_value=SimpleNamespace(id="a-004", basedOnVersionId="v-004")),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        AsyncMock(
            return_value=(
                SimpleNamespace(id="t-004"),
                [
                    {
                        "id": "legacy-slide-1",
                        "index": 0,
                        "title": "S1",
                        "content": "C1",
                        "sources": [],
                    },
                    {
                        "id": "legacy-slide-4",
                        "index": 3,
                        "title": "S4",
                        "content": "C4",
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
            "run_id": "run-002",
            "slide_id": "run-002-slide-3",
            "slide_index": 4,
            "instruction": "重做第4页",
            "artifact_id": "a-004",
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["slide_id"] == "run-002-slide-3"
    assert body["data"]["slide_index"] == 4
    execute_command.assert_awaited_once()
    command = execute_command.await_args.kwargs["command"]
    assert command["slide_id"] == "run-002-slide-3"
    assert command["slide_index"] == 4


def test_modify_preview_rejects_stale_base_render_version(
    client, monkeypatch, _as_user
):
    execute_command = AsyncMock(return_value={"task_id": "gt-001"})
    svc = SimpleNamespace(
        get_session_snapshot=AsyncMock(return_value=_snapshot(render_version=3)),
        execute_command=execute_command,
    )
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )

    resp = client.post(
        "/api/v1/generate/sessions/s-preview-001/preview/modify",
        json={
            "slide_id": "slide-1",
            "instruction": "把第1页改成问题导入",
            "artifact_id": "a-002",
            "base_render_version": 4,
        },
    )

    assert resp.status_code == 409
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "RESOURCE_CONFLICT"
    assert body["error"]["details"]["reason"] == "render_version_conflict"
    execute_command.assert_not_awaited()


def test_modify_preview_requires_explicit_slide_target(client, monkeypatch, _as_user):
    execute_command = AsyncMock(return_value={"task_id": "gt-002"})
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
    assert resp.status_code == 400
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INVALID_INPUT"
    execute_command.assert_not_awaited()


def test_modify_preview_rejects_conflicting_slide_targets(
    client, monkeypatch, _as_user
):
    execute_command = AsyncMock(return_value={"task_id": "gt-005"})
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
        AsyncMock(return_value=SimpleNamespace(id="a-005", basedOnVersionId="v-005")),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        AsyncMock(
            return_value=(
                SimpleNamespace(id="t-005"),
                [
                    {
                        "id": "run-005-slide-0",
                        "index": 0,
                        "title": "S1",
                        "content": "C1",
                        "sources": [],
                    },
                    {
                        "id": "run-005-slide-3",
                        "index": 3,
                        "title": "S4",
                        "content": "C4",
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
            "run_id": "run-005",
            "slide_id": "run-005-slide-3",
            "slide_index": 3,
            "instruction": "重做第4页",
            "artifact_id": "a-005",
        },
    )

    assert resp.status_code == 400
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["details"]["reason"] == "slide_target_conflict"
    execute_command.assert_not_awaited()


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
        execute_command=AsyncMock(return_value={"task_id": "gt-001"}),
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


def test_modify_preview_accepts_ppt_session_modify(client, monkeypatch, _as_user):
    svc = SimpleNamespace(
        get_session_snapshot=AsyncMock(return_value=_ppt_snapshot(render_version=5)),
        execute_command=AsyncMock(return_value={"task_id": "gt-ppt-001"}),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(
            return_value=SimpleNamespace(id="a-ppt-001", basedOnVersionId="v-ppt-001")
        ),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        AsyncMock(
            return_value=(
                SimpleNamespace(id="t-ppt-001"),
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
            "instruction": "改标题",
            "patch": {"title": "new title"},
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["artifact_id"] == "a-ppt-001"
    svc.execute_command.assert_awaited_once()


def test_get_slide_scene_returns_diego_scene(client, monkeypatch, _as_user):
    svc = SimpleNamespace(
        _db=SimpleNamespace(),
        get_session_snapshot=AsyncMock(return_value=_ppt_snapshot()),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(
            return_value=SimpleNamespace(id="a-ppt-001", basedOnVersionId="v-ppt-001")
        ),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        AsyncMock(
            return_value=(
                SimpleNamespace(id="t-ppt-001"),
                [
                    {
                        "id": "run-001-slide-0",
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
    get_scene = AsyncMock(
        return_value={
            "run_id": "run-001",
            "slide_id": "run-001-slide-0",
            "slide_index": 0,
            "slide_no": 1,
            "scene_version": "scene-v1",
            "nodes": [
                {
                    "node_id": "text:config:title",
                    "kind": "text",
                    "label": "Title",
                    "text": "S1",
                }
            ],
            "readonly": False,
            "readonly_reason": None,
        }
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "get_diego_slide_scene_for_run",
        get_scene,
    )

    resp = client.get(
        "/api/v1/generate/sessions/s-preview-001/preview/slides/run-001-slide-0/scene?run_id=run-001"
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["slide_no"] == 1
    assert body["data"]["nodes"][0]["node_id"] == "text:config:title"
    get_scene.assert_awaited_once()
    assert get_scene.await_args.kwargs["run_id"] == "run-001"
    assert get_scene.await_args.kwargs["slide_no"] == 1


def test_save_slide_scene_forwards_operations_to_diego(client, monkeypatch, _as_user):
    svc = SimpleNamespace(
        _db=SimpleNamespace(),
        get_session_snapshot=AsyncMock(return_value=_ppt_snapshot()),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(
            return_value=SimpleNamespace(id="a-ppt-001", basedOnVersionId="v-ppt-001")
        ),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        AsyncMock(
            return_value=(
                SimpleNamespace(id="t-ppt-001"),
                [
                    {
                        "id": "run-001-slide-0",
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
    save_scene = AsyncMock(
        return_value={
            "run_id": "run-001",
            "slide_id": "run-001-slide-0",
            "slide_index": 0,
            "slide_no": 1,
            "status": "ready",
            "scene": {
                "run_id": "run-001",
                "slide_id": "run-001-slide-0",
                "slide_index": 0,
                "slide_no": 1,
                "scene_version": "scene-v2",
                "nodes": [],
                "readonly": False,
                "readonly_reason": None,
            },
            "preview": {
                "slide_id": "run-001-slide-0",
                "svg_data_url": "data:image/svg+xml;base64,abc",
            },
        }
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "save_diego_slide_scene_for_run",
        save_scene,
    )

    resp = client.post(
        "/api/v1/generate/sessions/s-preview-001/preview/slides/run-001-slide-0/scene/save?run_id=run-001",
        json={
            "scene_version": "scene-v1",
            "operations": [
                {
                    "op": "replace_text",
                    "node_id": "text:config:title",
                    "value": "New Title",
                }
            ],
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["scene"]["scene_version"] == "scene-v2"
    save_scene.assert_awaited_once()
    assert save_scene.await_args.kwargs["slide_no"] == 1
    assert (
        save_scene.await_args.kwargs["payload"]["operations"][0]["node_id"]
        == "text:config:title"
    )


def test_save_slide_scene_forwards_replace_image_to_diego(
    client, monkeypatch, _as_user
):
    svc = SimpleNamespace(
        _db=SimpleNamespace(),
        get_session_snapshot=AsyncMock(return_value=_ppt_snapshot()),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(
            return_value=SimpleNamespace(id="a-ppt-001", basedOnVersionId="v-ppt-001")
        ),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        AsyncMock(
            return_value=(
                SimpleNamespace(id="t-ppt-001"),
                [
                    {
                        "id": "run-001-slide-0",
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
    save_scene = AsyncMock(
        return_value={
            "run_id": "run-001",
            "slide_id": "run-001-slide-0",
            "slide_index": 0,
            "slide_no": 1,
            "status": "ready",
            "scene": {
                "run_id": "run-001",
                "slide_id": "run-001-slide-0",
                "slide_index": 0,
                "slide_no": 1,
                "scene_version": "scene-v2",
                "nodes": [
                    {
                        "node_id": "image:hero",
                        "kind": "image",
                        "label": "Hero image",
                        "src": "https://img.test/full.jpg",
                    }
                ],
                "readonly": False,
                "readonly_reason": None,
            },
            "preview": {
                "slide_id": "run-001-slide-0",
                "svg_data_url": "data:image/svg+xml;base64,updated",
            },
        }
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "save_diego_slide_scene_for_run",
        save_scene,
    )

    resp = client.post(
        "/api/v1/generate/sessions/s-preview-001/preview/slides/run-001-slide-0/scene/save?run_id=run-001",
        json={
            "scene_version": "scene-v1",
            "operations": [
                {
                    "op": "replace_image",
                    "node_id": "image:hero",
                    "value": "https://img.test/full.jpg",
                }
            ],
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["scene"]["nodes"][0]["src"] == "https://img.test/full.jpg"
    save_scene.assert_awaited_once()
    operation = save_scene.await_args.kwargs["payload"]["operations"][0]
    assert operation == {
        "op": "replace_image",
        "node_id": "image:hero",
        "value": "https://img.test/full.jpg",
    }


def test_save_slide_scene_stale_scene_version_returns_conflict(
    client, monkeypatch, _as_user
):
    svc = SimpleNamespace(
        _db=SimpleNamespace(),
        get_session_snapshot=AsyncMock(return_value=_ppt_snapshot()),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(
            return_value=SimpleNamespace(id="a-ppt-001", basedOnVersionId="v-ppt-001")
        ),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        AsyncMock(
            return_value=(
                SimpleNamespace(id="t-ppt-001"),
                [
                    {
                        "id": "run-001-slide-0",
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
    save_scene = AsyncMock(
        side_effect=APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="scene_version 已过期",
            details={"reason": "diego_scene_conflict"},
            retryable=False,
        )
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "save_diego_slide_scene_for_run",
        save_scene,
    )

    resp = client.post(
        "/api/v1/generate/sessions/s-preview-001/preview/slides/run-001-slide-0/scene/save?run_id=run-001",
        json={
            "scene_version": "scene-old",
            "operations": [
                {
                    "op": "replace_text",
                    "node_id": "text:config:title",
                    "value": "New Title",
                }
            ],
        },
    )

    assert resp.status_code == 409
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "RESOURCE_CONFLICT"
    assert body["error"]["details"]["reason"] == "diego_scene_conflict"


def test_search_pexels_assets_returns_proxy_payload(client, monkeypatch, _as_user):
    search = AsyncMock(
        return_value={
            "query": "teacher classroom",
            "results": [
                {
                    "id": "p1",
                    "thumbnail_url": "https://img.test/thumb.jpg",
                    "full_url": "https://img.test/full.jpg",
                    "photographer": "Demo",
                    "width": 1200,
                    "height": 800,
                }
            ],
        }
    )
    monkeypatch.setattr(
        generate_sessions_preview_router, "search_pexels_images", search
    )

    resp = client.get("/api/v1/generate/assets/pexels/search?q=teacher classroom")

    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["query"] == "teacher classroom"
    assert body["data"]["results"][0]["id"] == "p1"
    search.assert_awaited_once_with("teacher classroom", per_page=4)


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
                            "format": "svg",
                            "svg_data_url": "data:image/svg+xml;base64,slide2",
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
    assert body["data"]["current_version_id"] == "v-current"
    assert body["data"]["upstream_updated"] is True
    assert body["data"]["artifact_anchor"]["run_id"] == "run-003"
    assert body["data"]["rendered_page"]["slide_id"] == "slide-2"
    assert load_preview_material.await_args.args[4] == "run-003"


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
    assert load_preview_material.await_args.args[4] == "run-011"


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
    assert data["current_version_id"] == "v-current"
    assert data["upstream_updated"] is True
    assert data["format"] == "markdown"
    assert data["render_version"] == 7
    assert data["content"] == "# Demo"
    assert data["artifact_anchor"]["run_id"] == "run-007"
    assert load_preview_material.await_args.args[4] == "run-007"


def test_export_preview_with_run_id_allows_docx_content_without_task(
    client, monkeypatch, _as_user
):
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
            None,
            [],
            None,
            {"markdown_content": "# DOCX Preview"},
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
    assert data["content"] == "# DOCX Preview"
    assert data["artifact_anchor"]["run_id"] == "run-007"
    assert load_preview_material.await_args.args[4] == "run-007"


def test_export_preview_html_prefers_structured_word_preview_html(
    client, monkeypatch, _as_user
):
    svc = SimpleNamespace(
        get_session_snapshot=AsyncMock(return_value=_snapshot(render_version=8))
    )
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-008", basedOnVersionId="v-008")),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        AsyncMock(
            return_value=(
                None,
                [],
                None,
                {
                    "title": "进程管理学生讲义",
                    "preview_html": "<!doctype html><html><body><main>Styled Word Preview</main></body></html>",
                    "lesson_plan_markdown": "# fallback markdown",
                },
            )
        ),
    )

    resp = client.post(
        "/api/v1/generate/sessions/s-preview-001/preview/export",
        json={"format": "html", "artifact_id": "a-008"},
    )

    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["format"] == "html"
    assert "Styled Word Preview" in data["content"]
    assert "<pre>" not in data["content"]
