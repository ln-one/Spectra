from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services import title_service


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
