from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from routers.chat.runtime_helpers import build_image_analysis_hint


@pytest.mark.asyncio
async def test_build_image_analysis_hint_skips_when_no_image_rag(monkeypatch):
    analyze_mock = AsyncMock()
    monkeypatch.setattr(
        "routers.chat.runtime_helpers.ai_service.analyze_images_for_chat",
        analyze_mock,
    )

    hint, reason, vision_model = await build_image_analysis_hint(
        project_id="p-1",
        user_message="请解释图片",
        rag_results=[
            SimpleNamespace(
                source=SimpleNamespace(source_type="document"),
                metadata={"upload_id": "u-doc"},
            )
        ],
    )

    assert hint is None
    assert reason is None
    assert vision_model is None
    analyze_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_build_image_analysis_hint_returns_hint_when_image_available(monkeypatch):
    monkeypatch.setattr(
        "routers.chat.runtime_helpers.find_many_with_select_fallback",
        AsyncMock(
            return_value=[
                {
                    "id": "u-img-1",
                    "filename": "ip-header.png",
                    "filepath": "/tmp/ip-header.png",
                }
            ]
        ),
    )
    analyze_mock = AsyncMock(
        return_value={
            "content": "图中包含版本号、首部长度、TTL 与协议字段。",
            "model": "vision-model",
        }
    )
    monkeypatch.setattr(
        "routers.chat.runtime_helpers.ai_service.analyze_images_for_chat",
        analyze_mock,
    )

    hint, reason, vision_model = await build_image_analysis_hint(
        project_id="p-1",
        user_message="这张图在讲什么？",
        rag_results=[
            SimpleNamespace(
                source=SimpleNamespace(source_type="image"),
                metadata={"upload_id": "u-img-1"},
            )
        ],
    )

    assert reason is None
    assert hint is not None
    assert vision_model == "vision-model"
    assert "图片可视解析补充" in hint
    assert "TTL" in hint
    analyze_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_build_image_analysis_hint_uses_requested_source_ids_when_rag_miss(
    monkeypatch,
):
    monkeypatch.setattr(
        "routers.chat.runtime_helpers.find_many_with_select_fallback",
        AsyncMock(
            return_value=[
                {
                    "id": "u-img-2",
                    "filename": "diagram.jpg",
                    "filepath": "/tmp/diagram.jpg",
                }
            ]
        ),
    )
    analyze_mock = AsyncMock(
        return_value={
            "content": "图中包含协议栈分层关系。",
            "model": "vision-model",
        }
    )
    monkeypatch.setattr(
        "routers.chat.runtime_helpers.ai_service.analyze_images_for_chat",
        analyze_mock,
    )

    hint, reason, vision_model = await build_image_analysis_hint(
        project_id="p-1",
        user_message="请看图回答",
        rag_results=[],
        requested_source_ids=["u-img-2"],
    )

    assert reason is None
    assert hint is not None
    assert vision_model == "vision-model"
    analyze_mock.assert_awaited_once()
