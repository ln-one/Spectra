"""
DashScope API 连通性测试

需要真实 DASHSCOPE_API_KEY 环境变量，标记为 integration 测试。
运行方式: pytest tests/test_dashscope_connectivity.py -v -m integration
"""

import asyncio

import pytest

import services.ai as ai_module
from services.ai import AIService, _resolve_model_name
from services.ai.model_router import ModelRouteFailureReason


class TestModelNameResolve:
    """模型名称解析（单元测试，无需 API Key）"""

    def test_qwen_plus_adds_prefix(self):
        assert _resolve_model_name("qwen3.5-plus") == "dashscope/qwen3.5-plus"

    def test_qwen_turbo_adds_prefix(self):
        assert _resolve_model_name("qwen-turbo") == "dashscope/qwen-turbo"

    def test_qwen2_adds_prefix(self):
        assert (
            _resolve_model_name("qwen2-72b-instruct") == "dashscope/qwen2-72b-instruct"
        )

    def test_already_prefixed_no_change(self):
        assert _resolve_model_name("dashscope/qwen3.5-plus") == "dashscope/qwen3.5-plus"

    def test_gpt_no_prefix(self):
        assert _resolve_model_name("gpt-3.5-turbo") == "gpt-3.5-turbo"

    def test_claude_no_prefix(self):
        assert (
            _resolve_model_name("claude-3-sonnet-20240229")
            == "claude-3-sonnet-20240229"
        )


@pytest.mark.asyncio
async def test_generate_times_out_with_clear_error(monkeypatch):
    ai_service = AIService()
    ai_service.request_timeout_seconds = 0.01
    ai_service.allow_ai_stub = False

    async def _slow_completion(**kwargs):
        await asyncio.sleep(0.05)

    monkeypatch.setattr(ai_module, "acompletion", _slow_completion)

    with pytest.raises(TimeoutError, match="timed out"):
        await ai_service.generate(
            prompt="timeout test",
            model="qwen3.5-plus",
            max_tokens=10,
        )


@pytest.mark.asyncio
async def test_generate_timeout_returns_stub_when_enabled(monkeypatch):
    ai_service = AIService()
    ai_service.request_timeout_seconds = 0.01
    ai_service.allow_ai_stub = True

    async def _slow_completion(**kwargs):
        await asyncio.sleep(0.05)

    monkeypatch.setattr(ai_module, "acompletion", _slow_completion)

    result = await ai_service.generate(
        prompt="timeout test",
        route_task="outline_generation",
        max_tokens=10,
    )
    assert result["content"].startswith("AI stub response")
    assert result["route"]["failure_reason"] == ModelRouteFailureReason.TIMEOUT.value


def test_chat_route_uses_chat_specific_timeout():
    ai_service = AIService()
    ai_service.request_timeout_seconds = 60
    ai_service.chat_request_timeout_seconds = 90

    assert ai_service._resolve_timeout_seconds("chat_response") == 90
    assert ai_service._resolve_timeout_seconds("outline_generation") == 60


@pytest.mark.asyncio
async def test_generate_completion_error_returns_stub_with_canonical_reason(
    monkeypatch,
):
    ai_service = AIService()
    ai_service.allow_ai_stub = True

    async def _boom_completion(**kwargs):
        raise RuntimeError("provider blew up")

    monkeypatch.setattr(ai_module, "acompletion", _boom_completion)

    result = await ai_service.generate(
        prompt="error test",
        route_task="outline_generation",
        max_tokens=10,
    )
    assert result["content"].startswith("AI stub response")
    assert (
        result["route"]["failure_reason"]
        == ModelRouteFailureReason.COMPLETION_ERROR.value
    )


@pytest.mark.integration
class TestDashScopeConnectivity:
    """DashScope API 连通性测试（需要真实 API Key）"""

    @pytest.fixture
    def ai_service(self):
        return AIService()

    @pytest.mark.asyncio
    async def test_simple_prompt(self, ai_service):
        """测试简单 prompt 调用"""
        result = await ai_service.generate(
            prompt="请用一句话介绍光合作用。",
            model="qwen3.5-plus",
            max_tokens=100,
        )
        assert result["content"]
        assert len(result["content"]) > 5
        assert result["tokens_used"] is not None

    @pytest.mark.asyncio
    async def test_chinese_response_quality(self, ai_service):
        """测试中文响应质量"""
        result = await ai_service.generate(
            prompt="什么是勾股定理？请用中文回答。",
            model="qwen3.5-plus",
            max_tokens=200,
        )
        content = result["content"]
        # 应包含中文字符
        assert any("\u4e00" <= c <= "\u9fff" for c in content)
