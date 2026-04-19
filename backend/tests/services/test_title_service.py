from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services import title_service
from services.title_service.prompting import build_run_fallback_title, extract_run_context


@pytest.mark.anyio
async def test_request_run_title_generation_claims_only_once(monkeypatch):
    update_many = AsyncMock(side_effect=[1, 0])
    db = SimpleNamespace(
        sessionrun=SimpleNamespace(update_many=update_many),
    )
    spawned_labels: list[str] = []

    def _drop_task(coro, *, label: str) -> None:
        spawned_labels.append(label)
        if hasattr(coro, "close"):
            coro.close()

    monkeypatch.setattr(title_service, "spawn_background_task", _drop_task)

    first = await title_service.request_run_title_generation(
        db=db,
        run_id="run-001",
        tool_type="ppt_generate",
        snapshot={"topic": "线性回归"},
    )
    second = await title_service.request_run_title_generation(
        db=db,
        run_id="run-001",
        tool_type="ppt_generate",
        snapshot={"topic": "线性回归"},
    )

    assert first is True
    assert second is False
    assert update_many.await_count == 2
    assert spawned_labels == ["run-title:run-001"]


def test_extract_run_context_prefers_topic_fields_over_config_noise():
    snapshot = {
        "topic": "牛顿第二定律",
        "pages": 12,
        "generation_mode": "scratch",
        "style_preset": "geo-bold",
        "visual_policy": "auto",
        "outline": {"title": "受力分析与公式应用"},
    }

    assert extract_run_context(snapshot) == "牛顿第二定律；受力分析与公式应用"


@pytest.mark.anyio
async def test_generate_run_title_falls_back_when_model_returns_config_fragment(
    monkeypatch,
):
    pending_run = SimpleNamespace(
        id="run-001",
        artifactId=None,
        runNo=3,
        title="第3次课件生成",
        titleSource="pending",
    )
    updated_run = SimpleNamespace(
        id="run-001",
        artifactId=None,
        runNo=3,
        title="牛顿第二定律课件生成",
        titleSource="fallback",
    )
    db = SimpleNamespace(
        sessionrun=SimpleNamespace(find_unique=AsyncMock(return_value=pending_run)),
    )

    monkeypatch.setattr(
        title_service,
        "update_session_run",
        AsyncMock(return_value=updated_run),
    )
    monkeypatch.setattr(
        title_service,
        "sync_run_title_to_artifact_metadata",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        title_service.ai_service,
        "generate",
        AsyncMock(return_value={"content": "generation_mode课程生成"}),
    )

    result = await title_service.generate_run_title(
        db=db,
        run_id="run-001",
        tool_type="studio_card:courseware_ppt",
        snapshot={
            "topic": "牛顿第二定律",
            "generation_mode": "scratch",
            "style_preset": "geo-bold",
        },
    )

    expected_title = build_run_fallback_title(
        tool_type="studio_card:courseware_ppt",
        snapshot={
            "topic": "牛顿第二定律",
            "generation_mode": "scratch",
            "style_preset": "geo-bold",
        },
        run_no=3,
    )
    assert result["run_title"] == expected_title
    assert result["run_title_source"] == "fallback"
    title_service.update_session_run.assert_awaited_once_with(
        db=db,
        run_id="run-001",
        title=expected_title,
        title_source="fallback",
    )
