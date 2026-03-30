from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from main import app
from services.database import db_service
from utils.dependencies import get_current_user


def _client() -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: "u-001"
    return TestClient(app)


def teardown_function():
    app.dependency_overrides.pop(get_current_user, None)


def test_list_sessions_falls_back_to_default_display_title(monkeypatch):
    now = datetime.now(timezone.utc)
    project = SimpleNamespace(id="p-001", userId="u-001", name="Test")
    session = SimpleNamespace(
        id="11111111-2222-3333-4444-abcdef123456",
        projectId="p-001",
        baseVersionId=None,
        outputType="ppt",
        state="IDLE",
        displayTitle=None,
        displayTitleSource=None,
        displayTitleUpdatedAt=None,
        createdAt=now,
        updatedAt=now,
    )
    fake_db = SimpleNamespace(
        generationsession=SimpleNamespace(
            find_many=AsyncMock(return_value=[session]),
            count=AsyncMock(return_value=1),
        )
    )
    monkeypatch.setattr(db_service, "get_project", AsyncMock(return_value=project))
    monkeypatch.setattr(db_service, "db", fake_db)

    client = _client()
    resp = client.get("/api/v1/generate/sessions?project_id=p-001")
    assert resp.status_code == 200
    item = resp.json()["data"]["sessions"][0]
    assert item["display_title"] == "会话-123456"
    assert item["display_title_source"] == "default"


def test_get_session_runs_returns_run_contract_fields(monkeypatch):
    monkeypatch.setattr(
        "routers.generate_sessions.runs.load_session_snapshot_or_raise",
        AsyncMock(return_value={"session": {"session_id": "s-001"}}),
    )
    monkeypatch.setattr(
        "routers.generate_sessions.runs.list_session_runs",
        AsyncMock(
            return_value={
                "runs": [
                    {
                        "run_id": "run-001",
                        "session_id": "s-001",
                        "project_id": "p-001",
                        "tool_type": "ppt_generate",
                        "run_no": 1,
                        "run_title": "第1次PPT生成",
                        "run_title_source": "pending",
                        "run_status": "processing",
                        "run_step": "outline",
                        "artifact_id": None,
                        "created_at": "2026-03-28T00:00:00+00:00",
                        "updated_at": "2026-03-28T00:00:00+00:00",
                    }
                ],
                "total": 1,
                "page": 1,
                "limit": 20,
            }
        ),
    )

    client = _client()
    resp = client.get("/api/v1/generate/sessions/s-001/runs")
    assert resp.status_code == 200
    run = resp.json()["data"]["runs"][0]
    assert run["run_id"] == "run-001"
    assert run["run_title_source"] == "pending"
    assert run["run_no"] == 1
