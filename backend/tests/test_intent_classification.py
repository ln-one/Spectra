"""
意图分类测试（使用 mock LLM）
"""

import json
from unittest.mock import AsyncMock, patch

import pytest

from schemas.intent import IntentType
from services.ai import AIService


class TestKeywordFallback:
    """关键词回退分类测试"""

    def test_modify_intent(self):
        result = AIService._classify_intent_by_keywords("请把第三页的标题修改一下")
        assert result.intent == IntentType.MODIFY_COURSEWARE
        assert result.method == "keyword_fallback"

    def test_confirm_intent(self):
        result = AIService._classify_intent_by_keywords("好的，开始生成吧")
        assert result.intent == IntentType.CONFIRM_GENERATION

    def test_question_intent(self):
        result = AIService._classify_intent_by_keywords("这个系统怎么使用？")
        assert result.intent == IntentType.ASK_QUESTION

    def test_requirement_intent(self):
        result = AIService._classify_intent_by_keywords(
            "我需要一个关于Python的教学课件"
        )
        assert result.intent == IntentType.DESCRIBE_REQUIREMENT

    def test_general_chat(self):
        result = AIService._classify_intent_by_keywords("今天天气不错")
        assert result.intent == IntentType.GENERAL_CHAT
        assert result.confidence < 0.5


class TestLLMClassification:
    """LLM 意图分类测试"""

    @pytest.mark.asyncio
    async def test_llm_success(self):
        svc = AIService()
        mock_response = {
            "content": json.dumps(
                {"intent": "describe_requirement", "confidence": 0.95}
            ),
            "model": "test",
            "tokens_used": 50,
        }
        with patch.object(svc, "generate", new_callable=AsyncMock) as mock_gen:
            mock_gen.return_value = mock_response
            result = await svc.classify_intent("我想做一个物理课件")
            assert result.intent == IntentType.DESCRIBE_REQUIREMENT
            assert result.confidence == 0.95
            assert result.method == "llm"

    @pytest.mark.asyncio
    async def test_llm_failure_falls_back(self):
        svc = AIService()
        with patch.object(svc, "generate", new_callable=AsyncMock) as mock_gen:
            mock_gen.side_effect = Exception("API error")
            result = await svc.classify_intent("请修改第一页")
            assert result.intent == IntentType.MODIFY_COURSEWARE
            assert result.method == "keyword_fallback"

    @pytest.mark.asyncio
    async def test_llm_invalid_json_falls_back(self):
        svc = AIService()
        mock_response = {
            "content": "not valid json",
            "model": "test",
            "tokens_used": 10,
        }
        with patch.object(svc, "generate", new_callable=AsyncMock) as mock_gen:
            mock_gen.return_value = mock_response
            result = await svc.classify_intent("你好")
            assert result.method == "keyword_fallback"

    @pytest.mark.asyncio
    async def test_llm_and_keyword_fallback_both_fail_returns_safe_default(self):
        svc = AIService()
        with patch.object(svc, "generate", new_callable=AsyncMock) as mock_gen:
            mock_gen.side_effect = Exception("API error")
            with patch.object(
                AIService,
                "_classify_intent_by_keywords",
                side_effect=Exception("fallback error"),
            ):
                result = await svc.classify_intent("任意消息")
                assert result.intent == IntentType.GENERAL_CHAT
                assert result.method == "keyword_fallback"
                assert result.confidence == 0.0
