from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.session_history import (
    RUN_TITLE_SOURCE_AUTO,
    generate_semantic_run_title,
)
from services.title_service.structured_runtime import StructuredTitleResult


@pytest.mark.anyio
async def test_generate_semantic_run_title_syncs_title_to_artifact_metadata(
    monkeypatch,
):
    pending_run = SimpleNamespace(
        id="run-001",
        artifactId="artifact-001",
        title="第1次PPT生成",
        titleSource="pending",
    )
    updated_run = SimpleNamespace(
        id="run-001",
        artifactId="artifact-001",
        title="线性回归教学课件",
        titleSource=RUN_TITLE_SOURCE_AUTO,
    )
    artifact = SimpleNamespace(
        id="artifact-001",
        metadata=json.dumps(
            {
                "status": "completed",
                "run_title": "第1次PPT生成",
            },
            ensure_ascii=False,
        ),
    )

    sessionrun_model = SimpleNamespace(
        find_unique=AsyncMock(return_value=pending_run),
        update=AsyncMock(return_value=updated_run),
    )
    artifact_model = SimpleNamespace(
        find_unique=AsyncMock(return_value=artifact),
        update=AsyncMock(return_value=None),
    )
    db = SimpleNamespace(
        sessionrun=sessionrun_model,
        artifact=artifact_model,
    )

    monkeypatch.setattr(
        "services.title_service.service.generate_structured_title",
        AsyncMock(
            return_value=StructuredTitleResult(
                title="线性回归教学课件",
                basis_key="topic",
                scene="run",
                model="minimax/MiniMax-M2.7",
                latency_ms=7.2,
            )
        ),
    )

    result = await generate_semantic_run_title(
        db=db,
        run_id="run-001",
        tool_type="ppt_generate",
        snapshot={"topic": "线性回归", "pages": 12},
    )

    assert result is not None
    assert result["run_title"] == "线性回归教学课件"
    assert result["run_title_source"] == RUN_TITLE_SOURCE_AUTO
    artifact_model.update.assert_awaited_once()
    metadata_payload = artifact_model.update.await_args.kwargs["data"]["metadata"]
    metadata = json.loads(metadata_payload)
    assert metadata["run_title"] == "线性回归教学课件"
    assert metadata["run_title_source"] == RUN_TITLE_SOURCE_AUTO
    assert metadata["title"] == "线性回归教学课件"
