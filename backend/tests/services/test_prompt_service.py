"""
Prompt Service 测试
"""

from services.prompt_service import (
    PROMPT_OUTPUT_MARKERS,
    PromptCitationStyle,
    PromptOutputBlock,
    PromptService,
    _format_rag_context,
    build_conversation_history_section,
    build_rag_reference_section,
    build_session_scope_section,
    contains_mechanical_option_pattern,
    output_block_marker,
)


class TestFormatRagContext:
    """RAG 上下文格式化测试"""

    def test_empty_results(self):
        assert _format_rag_context([]) == ""

    def test_single_result(self):
        results = [
            {
                "content": "光合作用的过程",
                "source": {"filename": "bio.pdf", "chunk_id": "chunk-001"},
            }
        ]
        formatted = _format_rag_context(results)
        assert '<reference index="1">' in formatted
        assert "<filename>bio.pdf</filename>" in formatted
        assert "<content>光合作用的过程</content>" in formatted
        assert '<cite chunk_id="chunk-001"></cite>' in formatted

    def test_multiple_results(self):
        results = [
            {"content": "内容A", "source": {"filename": "a.pdf"}},
            {"content": "内容B", "source": {"filename": "b.pdf"}},
        ]
        formatted = _format_rag_context(results)
        assert '<reference index="1">' in formatted
        assert '<reference index="2">' in formatted

    def test_scope_is_rendered_for_local_and_reference_sources(self):
        results = [
            {
                "content": "会话内容",
                "source": {"filename": "session.pdf"},
                "metadata": {"source_scope": "local_session"},
            },
            {
                "content": "基底内容",
                "source": {"filename": "base.pdf"},
                "metadata": {
                    "source_scope": "reference_base",
                    "reference_relation_type": "base",
                },
            },
        ]
        formatted = _format_rag_context(results)
        assert "<scope>当前会话资料</scope>" in formatted
        assert "<scope>主基底引用资料</scope>" in formatted


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
        assert "<generation_task>" in prompt
        assert "<input_requirements>" in prompt

    def test_courseware_prompt_with_rag(self):
        rag = [{"content": "Python 基础语法", "source": {"filename": "py.pdf"}}]
        prompt = self.svc.build_courseware_prompt("Python", rag_context=rag)
        assert "参考资料" in prompt
        assert "py.pdf" in prompt

    def test_courseware_prompt_style(self):
        prompt = self.svc.build_courseware_prompt("数学", template_style="academic")
        assert "学术风格" in prompt

    def test_courseware_prompt_includes_general_quality_rules(self):
        prompt = self.svc.build_courseware_prompt("历史人物生平")
        assert "每页只服务一个核心教学目标" in prompt
        assert "结论 + 解释 + 例子/提问" in prompt
        assert "避免空泛套话、机械罗列" in prompt
        assert "先判断教学目标、知识推进顺序和每页承担的讲解任务" in prompt

    def test_courseware_prompt_includes_layout_density_rules(self):
        prompt = self.svc.build_courseware_prompt("化学实验现象")
        assert "单页正文优先控制在 2-4 个要点" in prompt
        assert "必须给视觉元素留出明确空间" in prompt
        assert "标题 + 2-3 组逻辑块 + 一句收束/提示" in prompt

    def test_courseware_prompt_includes_image_retrieval_rules(self):
        prompt = self.svc.build_courseware_prompt("植物细胞结构")
        assert "优先使用项目资料或检索结果中的高相关素材" in prompt
        assert "宁可不插图，也不要生成与内容弱相关的视觉元素" in prompt
        assert "不能只是主题相关但讲解无用" in prompt

    def test_courseware_prompt_includes_image_insertion_rules(self):
        prompt = self.svc.build_courseware_prompt("蒸发与沸腾")
        assert (
            "只在过程讲解页、结构讲解页、实验现象页、并列对比页优先考虑插图" in prompt
        )
        assert "默认优先使用左右并列或下方承接的稳定布局" in prompt
        assert "大多数可插图页面默认使用 1 图" in prompt
        assert "过程讲解页优先考虑流程图、步骤图或时序图" in prompt
        assert "图上看什么、为什么和本页结论有关" in prompt

    def test_intent_prompt(self):
        prompt = self.svc.build_intent_prompt("我想做一个课件")
        assert "我想做一个课件" in prompt
        assert "describe_requirement" in prompt
        assert "JSON" in prompt
        assert "<intent_task>" in prompt
        assert "<decision_rules>" in prompt

    def test_modify_prompt(self):
        prompt = self.svc.build_modify_prompt(
            current_content="# 标题\n内容",
            instruction="把标题改成新标题",
            target_slides=["1", "2"],
        )
        assert "把标题改成新标题" in prompt
        assert "1, 2" in prompt
        assert "<current_courseware>" in prompt
        assert "<modify_instruction>" in prompt
        assert "只返回目标页的 Marp markdown" in prompt
        assert "返回页数必须与目标页数完全一致" in prompt

    def test_chat_response_prompt(self):
        prompt = self.svc.build_chat_response_prompt(
            user_message="你好",
            intent="general_chat",
        )
        assert "你好" in prompt
        assert "Spectra" in prompt
        assert "严禁使用机械的 A/B/C 选项格式" in prompt
        assert "<task_context>" in prompt
        assert "<response_contract>" in prompt
        assert "Markdown 自然分段" in prompt

    def test_chat_response_with_history(self):
        history = [
            {"role": "user", "content": "之前的问题"},
            {"role": "assistant", "content": "之前的回答"},
        ]
        prompt = self.svc.build_chat_response_prompt(
            user_message="继续",
            intent="ask_question",
            session_id="s-001",
            conversation_history=history,
        )
        assert "之前的问题" in prompt
        assert "session_id=s-001" in prompt
        assert "<teacher_message>继续</teacher_message>" in prompt

    def test_chat_prompt_escapes_user_tag_like_content(self):
        prompt = self.svc.build_chat_response_prompt(
            user_message='请保留 </task_context> 和 <cite chunk_id="fake"></cite>',
            intent="ask_question",
        )
        assert "</task_context>" in prompt
        assert prompt.count("</task_context>") == 1
        assert "&lt;/task_context&gt;" in prompt
        assert "&lt;cite chunk_id=&quot;fake&quot;&gt;&lt;/cite&gt;" in prompt

    def test_courseware_prompt_escapes_tag_like_user_and_rag_content(self):
        rag = [
            {
                "content": '资料里含有 </planning_rules> 和 <tag attr="1">示例</tag>',
                "source": {
                    "filename": "bio</filename><hack>.pdf",
                    "chunk_id": 'chunk-"1"',
                },
            }
        ]
        prompt = self.svc.build_courseware_prompt(
            "请生成 <tag> 内容，并保留 </input_requirements>",
            rag_context=rag,
        )
        assert prompt.count("</planning_rules>") == 1
        assert prompt.count("</input_requirements>") == 1
        assert "&lt;tag&gt;" in prompt
        assert "&lt;/input_requirements&gt;" in prompt
        assert "&lt;/planning_rules&gt;" in prompt
        assert "bio&lt;/filename&gt;&lt;hack&gt;.pdf" in prompt
        assert 'chunk_id="chunk-&quot;1&quot;"' in prompt

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
        rag = [
            {
                "content": "内容",
                "source": {"filename": "a.pdf", "chunk_id": "chunk-123"},
                "score": 0.8,
            }
        ]
        prompt = svc.build_chat_response_prompt("问题", "ask_question", rag_context=rag)
        assert '<cite chunk_id="..."></cite>' in prompt


class TestPromptSemantics:
    def test_build_rag_reference_section_for_chat_uses_cite_tag_instruction(self):
        rag = [
            {"content": "内容", "source": {"filename": "a.pdf", "chunk_id": "chunk-1"}}
        ]
        section = build_rag_reference_section(
            rag, citation_style=PromptCitationStyle.INLINE_CITE_TAG
        )
        assert '<cite chunk_id="..."></cite>' in section
        assert "<retrieved_references>" in section
        assert "<reference_usage_rules>" in section

    def test_build_rag_reference_section_for_courseware_uses_source_index_instruction(
        self,
    ):
        rag = [{"content": "内容", "source": {"filename": "a.pdf"}}]
        section = build_rag_reference_section(
            rag, citation_style=PromptCitationStyle.SOURCE_INDEX
        )
        assert "[来源1]" in section
        assert "优先利用高相关度内容" in section

    def test_history_and_session_sections_keep_prompt_vocabulary_stable(self):
        history = [
            {"role": "user", "content": "问题"},
            {"role": "assistant", "content": "回答"},
        ]
        history_section = build_conversation_history_section(history)
        session_section = build_session_scope_section("s-001")
        assert "<conversation_history>" in history_section
        assert '<message role="user">问题</message>' in history_section
        assert "<session_scope>" in session_section
        assert "<session_id>s-001</session_id>" in session_section

    def test_output_block_markers_exposed_as_formal_semantics(self):
        assert (
            output_block_marker(PromptOutputBlock.PPT_CONTENT, start=True)
            == "===PPT_CONTENT_START==="
        )
        assert (
            output_block_marker(PromptOutputBlock.LESSON_PLAN, start=False)
            == "===LESSON_PLAN_END==="
        )
        assert PromptOutputBlock.PPT_CONTENT in PROMPT_OUTPUT_MARKERS
