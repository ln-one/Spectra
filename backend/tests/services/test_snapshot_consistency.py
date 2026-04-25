from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.queries import get_session_snapshot
from services.generation_session_service.snapshot_state_queries import (
    load_latest_state_event,
)


@pytest.mark.anyio
async def test_load_latest_state_event_requires_explicit_matching_run_id():
    db = SimpleNamespace(
        sessionevent=SimpleNamespace(
            find_many=AsyncMock(
                return_value=[
                    SimpleNamespace(payload='{"state":"SUCCESS"}'),
                    SimpleNamespace(payload='{"run_id":"run-002","state":"SUCCESS"}'),
                    SimpleNamespace(payload='{"run_id":"run-001","state":"SUCCESS"}'),
                ]
            )
        )
    )

    event = await load_latest_state_event(db, "sess-001", "run-001")

    assert event is not None
    assert event.payload == '{"run_id":"run-001","state":"SUCCESS"}'


@pytest.mark.anyio
async def test_run_scoped_snapshot_skips_global_state_event_conflict(monkeypatch):
    session = SimpleNamespace(
        id="sess-001",
        projectId="proj-001",
        state="GENERATING_CONTENT",
        stateReason="processing",
        progress=None,
        resumable=True,
        updatedAt=None,
        renderVersion=None,
        displayTitle="教案工作台",
        displayTitleSource="default",
        displayTitleUpdatedAt=None,
        options=None,
        pptUrl=None,
        wordUrl=None,
        errorCode=None,
        errorMessage=None,
        errorRetryable=None,
    )
    latest_state_event = SimpleNamespace(
        state="SUCCESS",
        stateReason="done",
    )

    monkeypatch.setattr(
        "services.generation_session_service.queries.get_owned_session",
        AsyncMock(return_value=session),
    )
    monkeypatch.setattr(
        "services.generation_session_service.queries.load_latest_outline",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "services.generation_session_service.queries.load_snapshot_runtime_components",
        AsyncMock(
            return_value={
                "artifact_history": {
                    "artifact_id": "artifact-001",
                    "based_on_version_id": None,
                    "artifact_anchor": {
                        "session_id": "sess-001",
                        "artifact_id": "artifact-001",
                        "based_on_version_id": None,
                    },
                    "session_artifacts": [
                        {
                            "artifact_id": "artifact-001",
                            "based_on_version_id": None,
                        }
                    ],
                    "session_artifact_groups": [],
                },
                "latest_candidate_change": None,
                "current_run": SimpleNamespace(
                    id="run-001",
                    sessionId="sess-001",
                    projectId="proj-001",
                    toolType="word",
                    runNo=1,
                    title="教案生成",
                    titleSource="pending",
                    status="processing",
                    step="generate",
                    artifactId=None,
                    createdAt=None,
                    updatedAt=None,
                ),
            }
        ),
    )
    monkeypatch.setattr(
        "services.generation_session_service.queries.load_latest_state_event",
        AsyncMock(return_value=latest_state_event),
    )
    monkeypatch.setattr(
        "services.generation_session_service.queries.load_session_fallbacks",
        lambda _session: [],
    )
    monkeypatch.setattr(
        "services.generation_session_service.queries.build_snapshot_result",
        lambda _session: None,
    )
    guard = SimpleNamespace(get_allowed_actions=lambda _state: ["GENERATE"])

    payload = await get_session_snapshot(
        db=SimpleNamespace(),
        guard=guard,
        session_id="sess-001",
        user_id="user-001",
        contract_version="2026-03",
        schema_version=1,
        run_id="run-001",
    )

    assert payload["session"]["state"] == "GENERATING_CONTENT"
    assert payload["current_run"]["run_id"] == "run-001"
