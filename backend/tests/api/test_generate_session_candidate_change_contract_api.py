from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import routers.generate_sessions.candidate_change_api as candidate_change_router
import routers.generate_sessions.commands as generate_sessions_commands_router
import routers.generate_sessions.preview as generate_sessions_preview_router
from main import app
from schemas.project_space import CandidateChangeStatus
from services.database import db_service
from services.platform.state_transition_guard import GenerationState
from services.project_space_service import project_space_service
from utils.dependencies import get_current_user
from utils.exceptions import ErrorCode

_USER_ID = "u-candidate-001"


@pytest.fixture()
def _as_user():
    app.dependency_overrides[get_current_user] = lambda: _USER_ID
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _snapshot():
    return {
        "session": {
            "session_id": "s-candidate-001",
            "project_id": "p-candidate-001",
            "state": GenerationState.SUCCESS.value,
            "render_version": 4,
        },
        "session_artifacts": [
            {
                "artifact_id": "a-001",
                "capability": "summary",
                "title": "summary",
                "artifact_anchor": {
                    "session_id": "s-candidate-001",
                    "artifact_id": "a-001",
                    "based_on_version_id": "v-010",
                },
            }
        ],
        "result": {"ppt_url": "uploads/demo.pptx"},
        "outline": {"version": 1, "nodes": []},
    }


def _fake_change(payload: str):
    return SimpleNamespace(
        id="c-001",
        projectId="p-candidate-001",
        title="session-candidate",
        summary="summary",
        payload=payload,
        sessionId="s-candidate-001",
        baseVersionId="v-010",
        status=CandidateChangeStatus.PENDING.value,
        reviewComment=None,
        proposerUserId=_USER_ID,
        createdAt="2026-03-18T09:00:00Z",
        updatedAt="2026-03-18T09:00:00Z",
    )


def _confirm_result():
    return {
        "session": {
            "session_id": "s-candidate-001",
            "project_id": "p-candidate-001",
            "state": GenerationState.GENERATING_CONTENT.value,
        }
    }


def _cached_change():
    return {
        "id": "c-cached",
        "session_id": "s-candidate-001",
        "project_id": "p-candidate-001",
        "base_version_id": "v-010",
        "title": "cached-change",
        "summary": "cached summary",
        "payload": None,
        "status": "pending",
        "review_comment": None,
        "accepted_version_id": None,
        "proposer_user_id": _USER_ID,
        "created_at": "2026-03-18T09:00:00Z",
        "updated_at": "2026-03-18T09:00:00Z",
    }


def test_submit_session_candidate_change_success(client, monkeypatch, _as_user):
    svc = SimpleNamespace(get_session_snapshot=AsyncMock(return_value=_snapshot()))
    monkeypatch.setattr(candidate_change_router, "_get_session_service", lambda: svc)
    monkeypatch.setattr(
        db_service,
        "get_project",
        AsyncMock(
            return_value=SimpleNamespace(id="p-candidate-001", currentVersionId="v-999")
        ),
    )
    create_change = AsyncMock(return_value=_fake_change('{"review":{}}'))
    monkeypatch.setattr(project_space_service, "create_candidate_change", create_change)

    resp = client.post(
        "/api/v1/generate/sessions/s-candidate-001/candidate-change",
        json={"title": "session-candidate", "summary": "summary"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["change"]["session_id"] == "s-candidate-001"
    assert body["data"]["change"]["base_version_id"] == "v-010"
    kwargs = create_change.await_args.kwargs
    assert kwargs["project_id"] == "p-candidate-001"
    assert kwargs["session_id"] == "s-candidate-001"
    assert kwargs["base_version_id"] == "v-010"
    assert kwargs["payload"]["artifact_anchor"]["artifact_id"] == "a-001"
    assert kwargs["payload"]["base_version_context"]["source"] == "artifact_anchor"


def test_submit_session_candidate_change_rejects_non_object_payload(client, _as_user):
    resp = client.post(
        "/api/v1/generate/sessions/s-candidate-001/candidate-change",
        json={"payload": "invalid"},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INVALID_INPUT"


def test_submit_session_candidate_change_idempotency_hit_returns_cached(
    client, monkeypatch, _as_user
):
    svc = SimpleNamespace(get_session_snapshot=AsyncMock(return_value=_snapshot()))
    monkeypatch.setattr(candidate_change_router, "_get_session_service", lambda: svc)
    monkeypatch.setattr(
        db_service,
        "get_idempotency_response",
        AsyncMock(
            return_value={
                "success": True,
                "data": {"change": {"id": "c-cached", "session_id": "s-candidate-001"}},
                "message": "候选变更提交成功",
            }
        ),
    )
    create_change = AsyncMock(return_value=_fake_change('{"review":{}}'))
    monkeypatch.setattr(project_space_service, "create_candidate_change", create_change)

    resp = client.post(
        "/api/v1/generate/sessions/s-candidate-001/candidate-change",
        headers={"Idempotency-Key": "00000000-0000-0000-0000-000000001111"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["change"]["id"] == "c-cached"
    create_change.assert_not_awaited()


def test_confirm_outline_can_attach_candidate_change(client, monkeypatch, _as_user):
    svc = SimpleNamespace(
        execute_command=AsyncMock(return_value=_confirm_result()),
        get_session_snapshot=AsyncMock(return_value=_snapshot()),
    )
    monkeypatch.setattr(
        generate_sessions_commands_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        db_service,
        "get_project",
        AsyncMock(
            return_value=SimpleNamespace(id="p-candidate-001", currentVersionId="v-999")
        ),
    )
    create_change = AsyncMock(return_value=_fake_change('{"review":{}}'))
    monkeypatch.setattr(project_space_service, "create_candidate_change", create_change)

    resp = client.post(
        "/api/v1/generate/sessions/s-candidate-001/confirm",
        json={
            "candidate_change": {
                "title": "confirm-change",
                "summary": "submit after confirm",
            }
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["session"]["state"] == "GENERATING_CONTENT"
    assert body["data"]["candidate_change"]["session_id"] == "s-candidate-001"
    kwargs = create_change.await_args.kwargs
    assert kwargs["payload"]["generation_command"]["command_type"] == "CONFIRM_OUTLINE"
    assert kwargs["payload"]["trigger"] == "confirm_outline"
    assert kwargs["payload"]["artifact_anchor"]["artifact_id"] == "a-001"


def test_confirm_outline_rejects_non_object_candidate_change(
    client, monkeypatch, _as_user
):
    svc = SimpleNamespace(execute_command=AsyncMock(return_value=_confirm_result()))
    monkeypatch.setattr(
        generate_sessions_commands_router, "_get_session_service", lambda: svc
    )

    resp = client.post(
        "/api/v1/generate/sessions/s-candidate-001/confirm",
        json={"candidate_change": "invalid"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_INPUT"


def test_modify_preview_can_attach_candidate_change(client, monkeypatch, _as_user):
    svc = SimpleNamespace(
        execute_command=AsyncMock(return_value={"task_id": "modify-task-001"}),
        get_session_snapshot=AsyncMock(return_value=_snapshot()),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-001", basedOnVersionId="v-010")),
    )
    monkeypatch.setattr(
        db_service,
        "get_project",
        AsyncMock(
            return_value=SimpleNamespace(id="p-candidate-001", currentVersionId="v-999")
        ),
    )
    create_change = AsyncMock(return_value=_fake_change('{"review":{}}'))
    monkeypatch.setattr(project_space_service, "create_candidate_change", create_change)

    resp = client.post(
        "/api/v1/generate/sessions/s-candidate-001/preview/modify",
        json={
            "slide_id": "slide-001",
            "patch": {"title": "updated"},
            "artifact_id": "a-001",
            "candidate_change": {
                "title": "modify-change",
                "summary": "submit after preview modify",
            },
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["candidate_change"]["session_id"] == "s-candidate-001"
    kwargs = create_change.await_args.kwargs
    assert kwargs["payload"]["generation_command"]["command_type"] == "REGENERATE_SLIDE"
    assert kwargs["payload"]["generation_command"]["slide_id"] == "slide-001"
    assert kwargs["payload"]["trigger"] == "preview_modify"


def test_export_preview_candidate_change_idempotency_hit_returns_cached(
    client, monkeypatch, _as_user
):
    svc = SimpleNamespace(get_session_snapshot=AsyncMock(return_value=_snapshot()))
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-001", basedOnVersionId="v-010")),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        AsyncMock(
            return_value=(
                SimpleNamespace(id="task-export-001"),
                [],
                {"slides_plan": []},
                {"markdown_content": "# export"},
            )
        ),
    )
    monkeypatch.setattr(
        db_service,
        "get_idempotency_response",
        AsyncMock(return_value={"change": _cached_change()}),
    )
    create_change = AsyncMock(return_value=_fake_change('{"review":{}}'))
    monkeypatch.setattr(project_space_service, "create_candidate_change", create_change)

    resp = client.post(
        "/api/v1/generate/sessions/s-candidate-001/preview/export",
        headers={"Idempotency-Key": "00000000-0000-0000-0000-000000001114"},
        json={
            "format": "markdown",
            "candidate_change": {
                "title": "export-change",
                "summary": "submit after preview export",
            },
        },
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["candidate_change"]["id"] == "c-cached"
    create_change.assert_not_awaited()


def test_export_preview_candidate_change_unexpected_error_returns_internal_error(
    client, monkeypatch, _as_user
):
    svc = SimpleNamespace(get_session_snapshot=AsyncMock(return_value=_snapshot()))
    monkeypatch.setattr(
        generate_sessions_preview_router, "_get_session_service", lambda: svc
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-001", basedOnVersionId="v-010")),
    )
    monkeypatch.setattr(
        generate_sessions_preview_router,
        "_load_preview_material",
        AsyncMock(
            return_value=(
                SimpleNamespace(id="task-export-001"),
                [],
                {"slides_plan": []},
                {"markdown_content": "# export"},
            )
        ),
    )
    monkeypatch.setattr(
        project_space_service,
        "create_candidate_change",
        AsyncMock(side_effect=RuntimeError("storage down")),
    )

    resp = client.post(
        "/api/v1/generate/sessions/s-candidate-001/preview/export",
        json={
            "format": "markdown",
            "candidate_change": {
                "title": "export-change",
                "summary": "submit after preview export",
            },
        },
    )
    assert resp.status_code == 500
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == ErrorCode.INTERNAL_ERROR.value
    assert body["error"]["details"]["trigger"] == "preview_export"
