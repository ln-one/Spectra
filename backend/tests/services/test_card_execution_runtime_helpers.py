from types import SimpleNamespace

import pytest

from services.generation_session_service.card_execution_runtime_helpers import (
    load_artifact_content,
)


@pytest.mark.anyio
async def test_load_artifact_content_uses_animation_metadata_when_snapshot_missing():
    artifact = SimpleNamespace(
        type="gif",
        metadata={
            "kind": "animation_storyboard",
            "title": "电商订单流转",
            "summary": "演示订单从下单到签收的完整链路",
            "topic": "电商订单流转",
            "scene": "订单状态变化",
            "duration_seconds": 8,
            "rhythm": "balanced",
            "focus": "突出订单状态推进",
            "visual_type": "process_flow",
            "placements": [{"ppt_artifact_id": "ppt-001", "page_number": 2}],
            "render_spec": {
                "scenes": [
                    {
                        "title": "用户下单",
                        "description": "订单进入待支付状态",
                    }
                ]
            },
        },
        storagePath="/tmp/example.gif",
    )

    content = await load_artifact_content(artifact)

    assert content["kind"] == "animation_storyboard"
    assert content["format"] == "gif"
    assert content["title"] == "电商订单流转"
    assert content["duration_seconds"] == 8
    assert content["rhythm"] == "balanced"
    assert content["visual_type"] == "process_flow"
    assert content["scenes"][0]["title"] == "用户下单"
    assert content["placements"][0]["page_number"] == 2
