from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from main import app
from routers import generate_sessions as generate_sessions_router
from services.database import db_service
from services.project_space_service import project_space_service
from utils.dependencies import get_current_user

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
            "state": "SUCCESS",
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
        status="pending",
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
            "state": "GENERATING_CONTENT",
        }
    }


def test_submit_session_candidate_change_success(client, monkeypatch, _as_user):
    svc = SimpleNamespace(get_session_snapshot=AsyncMock(return_value=_snapshot()))
    monkeypatch.setattr(generate_sessions_router, "_get_session_service", lambda: svc)
    monkeypatch.setattr(
        generate_sessions_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-001", basedOnVersionId="v-010")),
    )
    create_change = AsyncMock(return_value=_fake_change('{"review":{}}'))
    monkeypatch.setattr(project_space_service, "create_candidate_change", create_change)
    monkeypatch.setattr(
        db_service,
        "get_project",
        AsyncMock(
            return_value=SimpleNamespace(
                id="p-candidate-001",
                currentVersionId="v-999",
            )
        ),
    )

    resp = client.post(
        "/api/v1/generate/sessions/s-candidate-001/candidate-change",
        json={"title": "session-candidate", "summary": "summary"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["change"]["session_id"] == "s-candidate-001"
    assert body["data"]["change"]["base_version_id"] == "v-010"
    create_change.assert_awaited_once()
    kwargs = create_change.await_args.kwargs
    assert kwargs["project_id"] == "p-candidate-001"
    assert kwargs["session_id"] == "s-candidate-001"
    assert kwargs["base_version_id"] == "v-010"
    assert kwargs["payload"]["artifact_anchor"]["artifact_id"] == "a-001"
    assert kwargs["payload"]["base_version_context"]["source"] == "artifact_anchor"


def test_submit_session_candidate_change_rejects_non_object_payload(
    client, monkeypatch, _as_user
):
    resp = client.post(
        "/api/v1/generate/sessions/s-candidate-001/candidate-change",
        json={"payload": "invalid"},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INVALID_INPUT"


def test_submit_session_candidate_change_fallbacks_to_project_current_version(
    client, monkeypatch, _as_user
):
    svc = SimpleNamespace(get_session_snapshot=AsyncMock(return_value=_snapshot()))
    monkeypatch.setattr(generate_sessions_router, "_get_session_service", lambda: svc)
    monkeypatch.setattr(
        generate_sessions_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-002", basedOnVersionId=None)),
    )
    monkeypatch.setattr(
        db_service,
        "get_project",
        AsyncMock(
            return_value=SimpleNamespace(
                id="p-candidate-001",
                currentVersionId="v-current-001",
            )
        ),
    )
    create_change = AsyncMock(return_value=_fake_change('{"review":{}}'))
    monkeypatch.setattr(project_space_service, "create_candidate_change", create_change)

    resp = client.post("/api/v1/generate/sessions/s-candidate-001/candidate-change")
    assert resp.status_code == 200
    kwargs = create_change.await_args.kwargs
    assert kwargs["base_version_id"] == "v-current-001"
    assert kwargs["payload"]["base_version_context"] == {
        "selected_base_version_id": "v-current-001",
        "source": "project_current_version",
    }


def test_list_session_candidate_changes_with_filters(client, monkeypatch, _as_user):
    svc = SimpleNamespace(get_session_snapshot=AsyncMock(return_value=_snapshot()))
    monkeypatch.setattr(generate_sessions_router, "_get_session_service", lambda: svc)
    list_changes = AsyncMock(
        return_value=[
            _fake_change('{"review":{"action":"accept","accepted_version_id":"v-100"}}')
        ]
    )
    monkeypatch.setattr(project_space_service, "get_candidate_changes", list_changes)

    resp = client.get(
        "/api/v1/generate/sessions/s-candidate-001/candidate-change"
        "?status=accepted&proposer_user_id=u-candidate-001"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["changes"][0]["accepted_version_id"] == "v-100"
    list_changes.assert_awaited_once_with(
        project_id="p-candidate-001",
        user_id=_USER_ID,
        status="accepted",
        proposer_user_id="u-candidate-001",
        session_id="s-candidate-001",
    )


def test_submit_session_candidate_change_idempotency_hit_returns_cached(
    client, monkeypatch, _as_user
):
    svc = SimpleNamespace(get_session_snapshot=AsyncMock(return_value=_snapshot()))
    monkeypatch.setattr(generate_sessions_router, "_get_session_service", lambda: svc)
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
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["change"]["id"] == "c-cached"
    create_change.assert_not_awaited()


def test_confirm_outline_can_attach_candidate_change(client, monkeypatch, _as_user):
    svc = SimpleNamespace(
        execute_command=AsyncMock(return_value=_confirm_result()),
        get_session_snapshot=AsyncMock(return_value=_snapshot()),
    )
    monkeypatch.setattr(generate_sessions_router, "_get_session_service", lambda: svc)
    monkeypatch.setattr(
        db_service,
        "get_project",
        AsyncMock(
            return_value=SimpleNamespace(
                id="p-candidate-001",
                currentVersionId="v-999",
            )
        ),
    )
    monkeypatch.setattr(
        generate_sessions_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-001", basedOnVersionId="v-010")),
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
    monkeypatch.setattr(generate_sessions_router, "_get_session_service", lambda: svc)

    resp = client.post(
        "/api/v1/generate/sessions/s-candidate-001/confirm",
        json={"candidate_change": "invalid"},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INVALID_INPUT"
    svc.execute_command.assert_not_awaited()


def test_modify_preview_can_attach_candidate_change(client, monkeypatch, _as_user):
    svc = SimpleNamespace(
        execute_command=AsyncMock(return_value={"task_id": "modify-task-001"}),
        get_session_snapshot=AsyncMock(return_value=_snapshot()),
    )
    monkeypatch.setattr(generate_sessions_router, "_get_session_service", lambda: svc)
    monkeypatch.setattr(
        generate_sessions_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-001", basedOnVersionId="v-010")),
    )
    monkeypatch.setattr(
        db_service,
        "get_project",
        AsyncMock(
            return_value=SimpleNamespace(
                id="p-candidate-001",
                currentVersionId="v-999",
            )
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
    assert body["success"] is True
    assert body["data"]["candidate_change"]["session_id"] == "s-candidate-001"
    kwargs = create_change.await_args.kwargs
    assert kwargs["payload"]["generation_command"]["command_type"] == "REGENERATE_SLIDE"
    assert kwargs["payload"]["generation_command"]["slide_id"] == "slide-001"
    assert kwargs["payload"]["trigger"] == "preview_modify"
    assert kwargs["payload"]["artifact_anchor"]["artifact_id"] == "a-001"


def test_modify_preview_rejects_non_object_candidate_change(
    client, monkeypatch, _as_user
):
    svc = SimpleNamespace(execute_command=AsyncMock())
    monkeypatch.setattr(generate_sessions_router, "_get_session_service", lambda: svc)

    resp = client.post(
        "/api/v1/generate/sessions/s-candidate-001/preview/modify",
        json={
            "slide_id": "slide-001",
            "patch": {"title": "updated"},
            "candidate_change": "invalid",
        },
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INVALID_INPUT"
    svc.execute_command.assert_not_awaited()
