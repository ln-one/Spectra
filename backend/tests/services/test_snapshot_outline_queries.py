import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.snapshot_outline_queries import (
    load_latest_outline,
)
from services.platform.generation_event_constants import GenerationEventType


@pytest.mark.anyio
async def test_load_latest_outline_keeps_session_outline_when_run_has_no_version():
    session = SimpleNamespace(
        id="sess-1",
        outlineVersions=[
            SimpleNamespace(
                version=2,
                outlineData=json.dumps(
                    {"nodes": [{"title": "确认后的第二页大纲"}]}
                ),
            )
        ],
    )
    db = SimpleNamespace(
        sessionevent=SimpleNamespace(find_many=AsyncMock(return_value=[])),
        outlineversion=SimpleNamespace(find_first=AsyncMock()),
    )

    outline = await load_latest_outline(db, session, run_id="run-1")

    assert outline == {
        "nodes": [{"title": "确认后的第二页大纲"}],
        "version": 2,
    }
    db.outlineversion.find_first.assert_not_awaited()


@pytest.mark.anyio
async def test_load_latest_outline_uses_run_specific_outline_version():
    session = SimpleNamespace(
        id="sess-1",
        outlineVersions=[
            SimpleNamespace(
                version=1,
                outlineData=json.dumps({"nodes": [{"title": "旧大纲"}]}),
            )
        ],
    )
    db = SimpleNamespace(
        sessionevent=SimpleNamespace(
            find_many=AsyncMock(
                return_value=[
                    SimpleNamespace(
                        payload=json.dumps({"run_id": "run-1", "version": 3})
                    )
                ]
            )
        ),
        outlineversion=SimpleNamespace(
            find_first=AsyncMock(
                return_value=SimpleNamespace(
                    version=3,
                    outlineData=json.dumps(
                        {"nodes": [{"title": "run 绑定大纲"}]}
                    ),
                )
            )
        ),
    )

    outline = await load_latest_outline(db, session, run_id="run-1")

    assert outline == {"nodes": [{"title": "run 绑定大纲"}], "version": 3}
    db.sessionevent.find_many.assert_awaited_once_with(
        where={
            "sessionId": "sess-1",
            "eventType": GenerationEventType.OUTLINE_UPDATED.value,
        },
        order={"createdAt": "desc"},
        take=100,
    )
    db.outlineversion.find_first.assert_awaited_once_with(
        where={"sessionId": "sess-1", "version": 3},
    )
