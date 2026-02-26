"""
Prompt Service 测试
"""

from services.prompt_service import PromptService, _format_rag_context


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
