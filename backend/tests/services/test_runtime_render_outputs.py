from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.task_executor.runtime_render_outputs import render_generation_outputs


@pytest.mark.asyncio
async def test_render_generation_outputs_reuses_authority_session_urls(monkeypatch):
    invoke_render_mock = AsyncMock(
        side_effect=AssertionError("legacy render job should not run")
    )
    monkeypatch.setattr(
        "services.render_engine_adapter.invoke_render_engine",
        invoke_render_mock,
    )

    db_service = SimpleNamespace(
        db=SimpleNamespace(
            generationsession=SimpleNamespace(
                find_unique=AsyncMock(
                    return_value=SimpleNamespace(
                        pptUrl="/downloads/pptx-authority",
                        wordUrl=None,
                    )
                )
            )
        ),
        update_generation_task_status=AsyncMock(),
    )
    context = SimpleNamespace(
        session_id="session-001",
        task_id="task-001",
        task_type="pptx",
        template_config={},
        project_id="project-001",
    )

    output_urls, artifact_paths, render_timings_ms, render_metadata = (
        await render_generation_outputs(
            db_service,
            context,
            {"title": "Authority"},
        )
    )

    assert output_urls == {"pptx": "/downloads/pptx-authority"}
    assert artifact_paths == {}
    assert render_timings_ms["render_engine_ms"] == 0.0
    assert render_metadata["output_source"] == "authority_artifact"
    db_service.update_generation_task_status.assert_awaited_once()
    invoke_render_mock.assert_not_awaited()
