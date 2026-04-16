from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.command_runtime import handle_regenerate_slide


@pytest.mark.anyio
async def test_handle_regenerate_slide_is_removed():
    db = SimpleNamespace()
    session = SimpleNamespace(id="s-001", projectId="p-001", renderVersion=1)
    append_event = AsyncMock()

    with pytest.raises(RuntimeError, match="旧链路已下线"):
        await handle_regenerate_slide(
            db=db,
            session=session,
            command={
                "slide_id": "slide-1",
                "slide_index": 1,
                "instruction": "优化当前页",
            },
            new_state="RENDERING",
            append_event=append_event,
            conflict_error_cls=RuntimeError,
        )
