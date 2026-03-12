"""
Prompt Service 测试
"""

from services.prompt_service import (
    PromptService,
    _format_rag_context,
    contains_mechanical_option_pattern,
)


class TestFormatRagContext:
    """RAG 上下文格式化测试"""

    def test_empty_results(self):
        assert _format_rag_context([]) == ""

    def test_single_result(self):
        results = [
            {
                "content": "光合作用的过程",
                "source": {"filename": "bio.pdf"},
            }
        ]
        formatted = _format_rag_context(results)
        assert "参考资料 1" in formatted
        assert "bio.pdf" in formatted
        assert "光合作用的过程" in formatted

    def test_multiple_results(self):
        results = [
            {"content": "内容A", "source": {"filename": "a.pdf"}},
            {"content": "内容B", "source": {"filename": "b.pdf"}},
        ]
        formatted = _format_rag_context(results)
        assert "参考资料 1" in formatted
        assert "参考资料 2" in formatted


class TestPromptService:
    """Prompt 模板测试"""

    def setup_method(self):
        self.svc = PromptService()

    def test_courseware_prompt_basic(self):
        prompt = self.svc.build_courseware_prompt("Python 入门")
        assert "Python 入门" in prompt
        assert "资深学科教学设计师" in prompt
        assert "PPT_CONTENT_START" in prompt
        assert "LESSON_PLAN_START" in prompt

    def test_courseware_prompt_with_rag(self):
        rag = [{"content": "Python 基础语法", "source": {"filename": "py.pdf"}}]
        prompt = self.svc.build_courseware_prompt("Python", rag_context=rag)
        assert "参考资料" in prompt
        assert "py.pdf" in prompt

    def test_courseware_prompt_style(self):
        prompt = self.svc.build_courseware_prompt("数学", template_style="academic")
        assert "学术风格" in prompt

    def test_intent_prompt(self):
        prompt = self.svc.build_intent_prompt("我想做一个课件")
        assert "我想做一个课件" in prompt
        assert "describe_requirement" in prompt
        assert "JSON" in prompt

    def test_modify_prompt(self):
        prompt = self.svc.build_modify_prompt(
            current_content="# 标题\n内容",
            instruction="把标题改成新标题",
            target_slides=["1", "2"],
        )
        assert "把标题改成新标题" in prompt
        assert "1, 2" in prompt

    def test_chat_response_prompt(self):
        prompt = self.svc.build_chat_response_prompt(
            user_message="你好",
            intent="general_chat",
        )
        assert "你好" in prompt
        assert "Spectra" in prompt
        assert "严禁使用机械的 A/B/C 选项格式" in prompt
        assert "自然助教口吻" in prompt

    def test_chat_response_with_history(self):
        history = [
            {"role": "user", "content": "之前的问题"},
            {"role": "assistant", "content": "之前的回答"},
        ]
        prompt = self.svc.build_chat_response_prompt(
            user_message="继续",
            intent="ask_question",
            conversation_history=history,
        )
        assert "之前的问题" in prompt

    def test_mechanical_option_detection_positive(self):
        text = "你可以选择 A/B/C 三种方式来完成。"
        assert contains_mechanical_option_pattern(text) is True

    def test_mechanical_option_detection_negative(self):
        text = "先从生活例子切入，再做一个课堂小实验。"
        assert contains_mechanical_option_pattern(text) is False


class TestFormatRagContextOptimized:
    """优化后的 RAG 上下文格式化测试（D-5.3）"""

    def test_score_displayed(self):
        results = [{"content": "内容", "source": {"filename": "a.pdf"}, "score": 0.85}]
        formatted = _format_rag_context(results)
        assert "85%" in formatted

    def test_score_missing_defaults_zero(self):
        results = [{"content": "内容", "source": {"filename": "a.pdf"}}]
        formatted = _format_rag_context(results)
        assert "0%" in formatted

    def test_long_chunk_truncated(self):
        from services.prompt_service import _RAG_CHUNK_MAX_CHARS

        long_content = "A" * (_RAG_CHUNK_MAX_CHARS + 100)
        results = [
            {"content": long_content, "source": {"filename": "a.pdf"}, "score": 0.9}
        ]
        formatted = _format_rag_context(results)
        assert "截断" in formatted
        assert len(formatted) < len(long_content) + 200

    def test_short_chunk_not_truncated(self):
        content = "短内容"
        results = [{"content": content, "source": {"filename": "a.pdf"}, "score": 0.9}]
        formatted = _format_rag_context(results)
        assert content in formatted
        assert "截断" not in formatted

    def test_citation_instruction_in_courseware_prompt(self):
        svc = PromptService()
        rag = [{"content": "内容", "source": {"filename": "a.pdf"}, "score": 0.8}]
        prompt = svc.build_courseware_prompt("主题", rag_context=rag)
        assert "来源编号" in prompt

    def test_citation_instruction_in_chat_prompt(self):
        svc = PromptService()
        rag = [{"content": "内容", "source": {"filename": "a.pdf"}, "score": 0.8}]
        prompt = svc.build_chat_response_prompt("问题", "ask_question", rag_context=rag)
        assert "来源编号" in prompt
