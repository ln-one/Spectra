from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.ppt_slide_regenerate import (
    regenerate_diego_slide_for_run,
)


class _FakeDiegoClient:
    def __init__(self) -> None:
        self.regenerate_calls: list[tuple[str, int, dict]] = []

    async def get_run(self, _run_id: str) -> dict:
        return {
            "status": "SUCCEEDED",
            "events": [
                {"seq": 1, "event": "slide.generated", "payload": {"slide_no": 1}},
                {"seq": 2, "event": "compile.completed", "payload": {}},
            ],
        }

    async def regenerate_slide(
        self,
        run_id: str,
        slide_no: int,
        payload: dict,
    ) -> dict:
        self.regenerate_calls.append((run_id, slide_no, payload))
        return {
            "run_id": run_id,
            "trace_id": "trace-1",
            "status": "SLIDES_GENERATING",
        }


@pytest.mark.anyio
async def test_regenerate_diego_slide_for_run_uses_matching_binding(monkeypatch):
    fake_client = _FakeDiegoClient()
    run = SimpleNamespace(
        id="run-1",
        sessionId="sess-1",
        projectId="proj-1",
    )
    session = SimpleNamespace(
        id="sess-1",
        userId="user-1",
        options=(
            '{"diego":{"provider":"diego","enabled":true,"diego_run_id":"diego-1",'
            '"diego_trace_id":"trace-1","spectra_run_id":"run-1"}}'
        ),
    )
    db = SimpleNamespace(
        sessionrun=SimpleNamespace(find_unique=AsyncMock(return_value=run)),
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
    )
    scheduled_labels: list[str] = []
    update_run_mock = AsyncMock()

    monkeypatch.setattr(
        "services.generation_session_service.ppt_slide_regenerate.build_diego_client",
        lambda: fake_client,
    )
    monkeypatch.setattr(
        "services.generation_session_service.ppt_slide_regenerate.spawn_background_task",
        lambda coro, label: (scheduled_labels.append(label), coro.close()),
    )
    monkeypatch.setattr(
        "services.generation_session_service.ppt_slide_regenerate.update_session_run",
        update_run_mock,
    )

    result = await regenerate_diego_slide_for_run(
        db=db,
        run_id="run-1",
        slide_no=2,
        instruction="精简标题",
        preserve_style=True,
        user_id="user-1",
    )

    assert result["status"] == "SLIDES_GENERATING"
    assert fake_client.regenerate_calls == [
        ("diego-1", 2, {"instruction": "精简标题", "preserve_style": True})
    ]
    update_run_mock.assert_awaited_once()
    assert len(scheduled_labels) == 1
