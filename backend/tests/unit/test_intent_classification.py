import json
from unittest.mock import AsyncMock, patch

import pytest

from schemas.intent import IntentType, ModifyType
from services.ai import AIService


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
    async def test_llm_failure_returns_safe_default(self):
        svc = AIService()
        with patch.object(svc, "generate", new_callable=AsyncMock) as mock_gen:
            mock_gen.side_effect = Exception("API error")
            result = await svc.classify_intent("请修改第一页")
            assert result.intent == IntentType.GENERAL_CHAT
            assert result.method == "llm_error"
            assert result.confidence == 0.0

    @pytest.mark.asyncio
    async def test_llm_invalid_json_returns_safe_default(self):
        svc = AIService()
        mock_response = {
            "content": "not valid json",
            "model": "test",
            "tokens_used": 10,
        }
        with patch.object(svc, "generate", new_callable=AsyncMock) as mock_gen:
            mock_gen.return_value = mock_response
            result = await svc.classify_intent("你好")
            assert result.method == "llm_error"
            assert result.intent == IntentType.GENERAL_CHAT
            assert result.confidence == 0.0


class TestModifyIntentDefaults:
    @pytest.mark.asyncio
    async def test_modify_intent_llm_failure_returns_safe_default(self):
        svc = AIService()
        with patch.object(svc, "generate", new_callable=AsyncMock) as mock_gen:
            mock_gen.side_effect = Exception("API error")
            result = await svc.parse_modify_intent("把第3页标题改成xxx")
            assert result.modify_type == ModifyType.CONTENT
            assert result.target_slides is None
