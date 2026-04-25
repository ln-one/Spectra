from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.preview_queries import (
    _reconcile_diego_success_session,
)


@pytest.mark.anyio
async def test_reconcile_diego_success_session_repairs_existing_output_state(
    monkeypatch,
):
    db = SimpleNamespace()
    run = SimpleNamespace(
        id="run-001",
        runNo=7,
        title="Run 7",
        toolType="studio_card:courseware_ppt",
        status="processing",
        step="preview",
        artifactId=None,
    )
    session = SimpleNamespace(
        id="s-001",
        userId="u-001",
        projectId="p-001",
        state="FAILED",
        stateReason="worker_interrupted",
        progress=100,
        resumable=True,
        updatedAt=None,
        renderVersion=4,
        options=None,
        pptUrl="/api/v1/projects/p-001/artifacts/a-001/download",
        wordUrl=None,
    )
    repaired = SimpleNamespace(
        **{
            **session.__dict__,
            "state": "SUCCESS",
            "stateReason": "task_completed",
        }
    )

    monkeypatch.setattr(
        "services.generation_session_service.preview_queries._resolve_diego_reconcile_run",
        AsyncMock(return_value=run),
    )
    monkeypatch.setattr(
        "services.generation_session_service.preview_queries._is_latest_session_run",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        "services.generation_session_service.preview_queries._load_latest_session_artifact",
        AsyncMock(return_value=SimpleNamespace(id="artifact-1")),
    )
    update_run = AsyncMock()
    monkeypatch.setattr(
        "services.generation_session_service.preview_queries.update_session_run",
        update_run,
    )
    set_state = AsyncMock()
    monkeypatch.setattr(
        "services.generation_session_service.preview_queries.set_session_state",
        set_state,
    )
    monkeypatch.setattr(
        "services.generation_session_service.preview_queries.get_owned_session",
        AsyncMock(return_value=repaired),
    )

    result = await _reconcile_diego_success_session(
        db=db,
        session=session,
        options={"diego": {"diego_run_id": "diego-1", "spectra_run_id": "run-001"}},
    )

    update_run.assert_awaited_once_with(
        db=db,
        run_id="run-001",
        status="completed",
        step="completed",
        artifact_id="artifact-1",
    )
    set_state.assert_awaited_once()
    assert set_state.await_args.kwargs["state"] == "SUCCESS"
    assert set_state.await_args.kwargs["ppt_url"] == session.pptUrl
    assert result is repaired
