from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.preview_helpers.material_lookup import resolve_preview_material_context


@pytest.mark.asyncio
async def test_resolve_preview_material_context_prefers_run_artifact():
    async def _run_find_unique(**kwargs):
        assert kwargs == {"where": {"id": "run-001"}}
        return SimpleNamespace(
            id="run-001",
            sessionId="session-001",
            artifactId="art-001",
        )

    async def _artifact_find_unique(**kwargs):
        assert kwargs == {"where": {"id": "art-001"}}
        return SimpleNamespace(
            id="art-001",
            sessionId="session-001",
            metadata='{"preview_content":{"markdown_content":"# Slide"}}',
            storagePath=None,
        )

    db_service = SimpleNamespace(
        db=SimpleNamespace(
            sessionrun=SimpleNamespace(
                find_unique=AsyncMock(side_effect=_run_find_unique)
            ),
            artifact=SimpleNamespace(
                find_unique=AsyncMock(side_effect=_artifact_find_unique)
            ),
        )
    )

    context = await resolve_preview_material_context(
        db_service,
        "session-001",
        artifact_id=None,
        run_id="run-001",
    )

    assert context is not None
    assert context["artifact_id"] == "art-001"
    assert context["run_id"] == "run-001"
    assert context["render_job_id"] == "art-001"
    assert (
        context["artifact_metadata"]["preview_content"]["markdown_content"] == "# Slide"
    )
    assert "legacy_task" not in context


@pytest.mark.asyncio
async def test_resolve_preview_material_context_falls_back_to_latest_session_artifact():
    db_service = SimpleNamespace(
        db=SimpleNamespace(
            sessionrun=SimpleNamespace(find_unique=AsyncMock(return_value=None)),
            artifact=SimpleNamespace(
                find_first=AsyncMock(
                    return_value=SimpleNamespace(
                        id="art-002",
                        sessionId="session-002",
                        metadata={},
                    )
                )
            ),
        )
    )

    context = await resolve_preview_material_context(
        db_service,
        "session-002",
        artifact_id=None,
        run_id=None,
    )

    assert context is not None
    assert context["artifact_id"] == "art-002"
    assert context["run_id"] is None
    assert context["render_job_id"] == "art-002"
    assert context["artifact_metadata"] == {}
