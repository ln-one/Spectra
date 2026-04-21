from unittest.mock import AsyncMock

import pytest

from services.ai import ModelRouteTask, ai_service
from services.generation_session_service.teaching_brief_extractor import (
    _select_fields_to_apply,
    extract_brief_from_conversation,
)


@pytest.mark.asyncio
async def test_extract_brief_from_conversation_finds_topic_and_audience(monkeypatch):
    monkeypatch.setenv("BRIEF_EXTRACTION_ENABLED", "true")
    monkeypatch.setenv("BRIEF_EXTRACTION_MIN_CONFIDENCE", "0.6")
    monkeypatch.delenv("BRIEF_EXTRACTION_MAX_TOKENS", raising=False)
    generate_mock = AsyncMock(
        return_value={
            "content": (
                '{"fields":{"topic":"牛顿第二定律","audience":"高一学生"},'
                '"confidence":0.84}'
            )
        }
    )
    monkeypatch.setattr(ai_service, "generate", generate_mock)

    result = await extract_brief_from_conversation(
        recent_messages=[
            {"role": "user", "content": "我要做一个高一物理的课件。"},
            {"role": "assistant", "content": "先告诉我核心主题。"},
            {"role": "user", "content": "主题是牛顿第二定律，面向高一学生。"},
        ],
        current_brief={"status": "draft"},
        missing_fields=["topic", "audience", "knowledge_points"],
    )

    assert result == {
        "fields": {"topic": "牛顿第二定律", "audience": "高一学生"},
        "confidence": 0.84,
    }
    assert (
        generate_mock.await_args.kwargs["route_task"]
        == ModelRouteTask.SHORT_TEXT_POLISH
    )
    assert generate_mock.await_args.kwargs["response_format"] == {"type": "json_object"}
    assert generate_mock.await_args.kwargs["max_tokens"] == 12000


@pytest.mark.asyncio
async def test_extract_brief_from_conversation_returns_none_for_irrelevant_chat(
    monkeypatch,
):
    monkeypatch.setenv("BRIEF_EXTRACTION_ENABLED", "true")
    generate_mock = AsyncMock(return_value={"content": "{}"})
    monkeypatch.setattr(ai_service, "generate", generate_mock)

    result = await extract_brief_from_conversation(
        recent_messages=[
            {"role": "user", "content": "你好，先随便聊聊。"},
            {"role": "assistant", "content": "可以，我们先聊聊你的课堂背景。"},
        ],
        current_brief={"status": "draft"},
        missing_fields=["topic", "audience"],
    )

    assert result is None


def test_select_fields_to_apply_only_fills_blanks_when_confidence_low():
    selected, overwritten = _select_fields_to_apply(
        current_brief={"topic": "旧主题", "audience": ""},
        proposed_fields={"topic": "新主题", "audience": "高一学生"},
        confidence=0.72,
    )

    assert selected == {"audience": "高一学生"}
    assert overwritten == []


def test_select_fields_to_apply_allows_overwrite_when_confidence_high():
    selected, overwritten = _select_fields_to_apply(
        current_brief={"topic": "旧主题", "audience": "旧受众"},
        proposed_fields={"topic": "新主题", "audience": "高一学生"},
        confidence=0.92,
    )

    assert selected == {"topic": "新主题", "audience": "高一学生"}
    assert overwritten == ["topic", "audience"]
