from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from main import app
from routers import generate_sessions as generate_sessions_router
from utils.dependencies import get_current_user

_USER_ID = "u-preview-001"


@pytest.fixture()
def _as_user():
    app.dependency_overrides[get_current_user] = lambda: _USER_ID
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _snapshot(render_version: int = 3, state: str = "SUCCESS"):
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


def test_get_preview_includes_artifact_binding(client, monkeypatch, _as_user):
    svc = SimpleNamespace(get_session_snapshot=AsyncMock(return_value=_snapshot()))
    monkeypatch.setattr(generate_sessions_router, "_get_session_service", lambda: svc)
    monkeypatch.setattr(
        generate_sessions_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-001", basedOnVersionId="v-001")),
    )
    monkeypatch.setattr(
        generate_sessions_router,
        "_load_preview_material",
        AsyncMock(return_value=(SimpleNamespace(id="t-001"), [], None, {})),
    )

    resp = client.get(
        "/api/v1/generate/sessions/s-preview-001/preview?artifact_id=a-001"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["artifact_id"] == "a-001"
    assert body["data"]["based_on_version_id"] == "v-001"


def test_modify_preview_returns_contract_fields(client, monkeypatch, _as_user):
    svc = SimpleNamespace(
        get_session_snapshot=AsyncMock(return_value=_snapshot(render_version=5)),
        execute_command=AsyncMock(return_value={"task_id": "gt-001"}),
    )
    monkeypatch.setattr(generate_sessions_router, "_get_session_service", lambda: svc)
    monkeypatch.setattr(
        generate_sessions_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-002", basedOnVersionId="v-002")),
    )

    resp = client.post(
        "/api/v1/generate/sessions/s-preview-001/preview/modify",
        json={
            "slide_id": "slide-1",
            "patch": {"title": "new title"},
            "artifact_id": "a-002",
        },
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["session_id"] == "s-preview-001"
    assert data["modify_task_id"] == "gt-001"
    assert data["artifact_id"] == "a-002"
    assert data["based_on_version_id"] == "v-002"
    assert data["render_version"] == 5


def test_get_slide_preview_returns_slide_shape(client, monkeypatch, _as_user):
    svc = SimpleNamespace(get_session_snapshot=AsyncMock(return_value=_snapshot()))
    monkeypatch.setattr(generate_sessions_router, "_get_session_service", lambda: svc)
    monkeypatch.setattr(
        generate_sessions_router,
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
    monkeypatch.setattr(
        generate_sessions_router,
        "_load_preview_material",
        AsyncMock(return_value=(SimpleNamespace(id="t-003"), slides, lesson_plan, {})),
    )

    resp = client.get("/api/v1/generate/sessions/s-preview-001/preview/slides/slide-2")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["slide"]["id"] == "slide-2"
    assert body["data"]["teaching_plan"]["slide_id"] == "slide-2"
    assert body["data"]["artifact_id"] == "a-003"


def test_export_preview_expected_render_version_conflict(client, monkeypatch, _as_user):
    svc = SimpleNamespace(
        get_session_snapshot=AsyncMock(return_value=_snapshot(render_version=4))
    )
    monkeypatch.setattr(generate_sessions_router, "_get_session_service", lambda: svc)

    resp = client.post(
        "/api/v1/generate/sessions/s-preview-001/preview/export",
        json={"format": "markdown", "expected_render_version": 5},
    )
    assert resp.status_code == 409
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "RESOURCE_CONFLICT"


def test_export_preview_returns_binding_and_content(client, monkeypatch, _as_user):
    svc = SimpleNamespace(
        get_session_snapshot=AsyncMock(return_value=_snapshot(render_version=7))
    )
    monkeypatch.setattr(generate_sessions_router, "_get_session_service", lambda: svc)
    monkeypatch.setattr(
        generate_sessions_router,
        "_resolve_session_artifact_binding",
        AsyncMock(return_value=SimpleNamespace(id="a-004", basedOnVersionId="v-007")),
    )
    monkeypatch.setattr(
        generate_sessions_router,
        "_load_preview_material",
        AsyncMock(
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
        ),
    )

    resp = client.post(
        "/api/v1/generate/sessions/s-preview-001/preview/export",
        json={"format": "markdown", "artifact_id": "a-004"},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["artifact_id"] == "a-004"
    assert data["based_on_version_id"] == "v-007"
    assert data["format"] == "markdown"
    assert data["render_version"] == 7
    assert data["content"] == "# Demo"
