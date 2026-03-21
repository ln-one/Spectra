"""
CoursewareAIMixin 测试

测试大纲生成、结构化内容提取、解析和 fallback 逻辑。
使用 mock LLM 响应，不依赖真实 API。
"""

import json
from unittest.mock import AsyncMock, patch

import pytest

from schemas.generation import CoursewareContent
from schemas.outline import CoursewareOutline, OutlineSection
from services.ai import AIService


class TestGenerateOutline:
    """generate_outline() 测试"""

    @pytest.mark.asyncio
    async def test_successful_outline_generation(self):
        """LLM 返回合法 JSON 时正确解析大纲"""
        ai = AIService()
        mock_json = json.dumps(
            {
                "title": "Python 入门",
                "sections": [
                    {"title": "导入", "key_points": ["背景", "目标"], "slide_count": 2},
                    {"title": "核心", "key_points": ["语法", "实践"], "slide_count": 4},
                    {"title": "总结", "key_points": ["回顾"], "slide_count": 1},
                ],
                "summary": "Python 基础教学大纲",
            }
        )
        with (
            patch.object(
                ai,
                "generate",
                new_callable=AsyncMock,
                return_value={"content": mock_json},
            ),
            patch.object(
                ai, "_retrieve_rag_context", new_callable=AsyncMock, return_value=None
            ),
        ):
            outline = await ai.generate_outline("proj1", "Python 入门")

        assert isinstance(outline, CoursewareOutline)
        assert outline.title == "Python 入门"
        assert len(outline.sections) >= 3
        section_titles = [section.title for section in outline.sections]
        assert "导入" in section_titles
        assert "核心" in section_titles
        assert "总结" in section_titles
        # sparse-outline enrichment may expand sections/slides, but should keep baseline size
        assert outline.total_slides >= 2 + 4 + 1 + 2
        assert outline.summary == "Python 基础教学大纲"

    @pytest.mark.asyncio
    async def test_outline_with_rag_context(self):
        """有 RAG 上下文时注入到 prompt"""
        ai = AIService()
        mock_json = json.dumps(
            {
                "title": "光合作用",
                "sections": [
                    {"title": "概念", "key_points": ["定义"], "slide_count": 3},
                ],
                "summary": "光合作用教学",
            }
        )
        rag_results = [{"content": "光合作用是...", "source": {"filename": "bio.pdf"}}]

        with (
            patch.object(
                ai,
                "generate",
                new_callable=AsyncMock,
                return_value={"content": mock_json},
            ) as mock_gen,
            patch.object(
                ai,
                "_retrieve_rag_context",
                new_callable=AsyncMock,
                return_value=rag_results,
            ),
        ):
            outline = await ai.generate_outline("proj2", "光合作用")

        # prompt 中应包含 RAG 上下文
        prompt_arg = mock_gen.call_args[1]["prompt"]
        assert "参考内容" in prompt_arg
        assert isinstance(outline, CoursewareOutline)

    @pytest.mark.asyncio
    async def test_outline_empty_sections_triggers_fallback(self):
        """LLM 返回空 sections 时应 fallback"""
        ai = AIService()
        mock_json = json.dumps({"title": "空大纲", "sections": [], "summary": "无"})

        with (
            patch.object(
                ai,
                "generate",
                new_callable=AsyncMock,
                return_value={"content": mock_json},
            ),
            patch.object(
                ai, "_retrieve_rag_context", new_callable=AsyncMock, return_value=None
            ),
        ):
            outline = await ai.generate_outline("proj3", "测试空大纲")

        # empty sections raises ValueError → fallback
        assert isinstance(outline, CoursewareOutline)
        assert len(outline.sections) >= 1
        assert outline.summary == "基础教学大纲"

    @pytest.mark.asyncio
    async def test_outline_sparse_sections_are_enriched(self):
        """过于单薄的大纲应补齐完整教学结构，而不是原样放过"""
        ai = AIService()
        sparse_json = json.dumps(
            {
                "title": "牛顿第二定律",
                "sections": [
                    {
                        "title": "导入",
                        "key_points": ["主题引入", "学习动机"],
                        "slide_count": 1,
                    }
                ],
                "summary": "非常简短",
            }
        )

        with (
            patch.object(
                ai,
                "generate",
                new_callable=AsyncMock,
                return_value={"content": sparse_json},
            ),
            patch.object(
                ai, "_retrieve_rag_context", new_callable=AsyncMock, return_value=None
            ),
        ):
            outline = await ai.generate_outline("proj-sparse", "牛顿第二定律")

        assert len(outline.sections) >= 4
        titles = [section.title for section in outline.sections]
        assert "核心概念" in titles
        assert "案例与应用" in titles
        assert "练习与总结" in titles
        assert outline.total_slides >= 10

    @pytest.mark.asyncio
    async def test_outline_aligns_with_target_pages_and_focus_anchors(self):
        """当需求包含目标页数时，应尽量对齐并覆盖核心教学锚点。"""
        ai = AIService()
        mock_json = json.dumps(
            {
                "title": "电路分析",
                "sections": [
                    {
                        "title": "电路基础",
                        "key_points": ["概念定义", "基础公式"],
                        "slide_count": 2,
                    },
                    {
                        "title": "典型题型",
                        "key_points": ["题型识别", "解题步骤"],
                        "slide_count": 2,
                    },
                ],
                "summary": "电路分析教学大纲",
            }
        )

        with (
            patch.object(
                ai,
                "generate",
                new_callable=AsyncMock,
                return_value={"content": mock_json},
            ),
            patch.object(
                ai, "_retrieve_rag_context", new_callable=AsyncMock, return_value=None
            ),
        ):
            outline = await ai.generate_outline(
                "proj-pages",
                "高一物理，目标页数：12，强调知识地图、关键例题、易错点澄清",
            )

        total_section_slides = sum(section.slide_count for section in outline.sections)
        assert total_section_slides == 12
        merged_points = " ".join(
            point
            for section in outline.sections
            for point in (section.key_points or [])
        )
        assert "知识地图" in merged_points
        assert "关键例题" in merged_points
        assert "易错点澄清" in merged_points

    @pytest.mark.asyncio
    async def test_outline_no_json_triggers_fallback(self):
        """LLM 返回非 JSON 时应 fallback"""
        ai = AIService()

        with (
            patch.object(
                ai,
                "generate",
                new_callable=AsyncMock,
                return_value={"content": "这不是 JSON 内容"},
            ),
            patch.object(
                ai, "_retrieve_rag_context", new_callable=AsyncMock, return_value=None
            ),
        ):
            outline = await ai.generate_outline("proj4", "测试非JSON")

        assert isinstance(outline, CoursewareOutline)
        assert outline.summary == "基础教学大纲"

    @pytest.mark.asyncio
    async def test_outline_llm_exception_triggers_fallback(self):
        """LLM 调用异常时应 fallback"""
        ai = AIService()

        with (
            patch.object(
                ai,
                "generate",
                new_callable=AsyncMock,
                side_effect=RuntimeError("API down"),
            ),
            patch.object(
                ai, "_retrieve_rag_context", new_callable=AsyncMock, return_value=None
            ),
        ):
            outline = await ai.generate_outline("proj5", "测试异常")

        assert isinstance(outline, CoursewareOutline)
        assert outline.summary == "基础教学大纲"

    @pytest.mark.asyncio
    async def test_outline_fallback_aligns_with_plain_target_page_phrase(self):
        """当需求写成“12 页”时，fallback 也应对齐目标页数。"""
        ai = AIService()

        with (
            patch.object(
                ai,
                "generate",
                new_callable=AsyncMock,
                side_effect=RuntimeError("API down"),
            ),
            patch.object(
                ai, "_retrieve_rag_context", new_callable=AsyncMock, return_value=None
            ),
        ):
            outline = await ai.generate_outline(
                "proj6",
                "生成“知识地图 + 关键例题 + 易错点澄清”风格大纲，12 页，强调课堂互动提问与板书逻辑。",
            )

        assert isinstance(outline, CoursewareOutline)
        assert sum(section.slide_count for section in outline.sections) == 12

    @pytest.mark.asyncio
    async def test_outline_generic_placeholder_sections_are_rebuilt(self):
        """当 LLM 返回“核心知识点/要点1”占位结构时，应自动重建为可用大纲。"""
        ai = AIService()
        generic_json = json.dumps(
            {
                "title": "测试大纲",
                "sections": [
                    {
                        "title": f"核心知识点{i}",
                        "key_points": ["要点1", "要点2", "要点3"],
                        "slide_count": 1,
                    }
                    for i in range(1, 7)
                ],
                "summary": "占位结构",
            }
        )

        with (
            patch.object(
                ai,
                "generate",
                new_callable=AsyncMock,
                return_value={"content": generic_json},
            ),
            patch.object(
                ai, "_retrieve_rag_context", new_callable=AsyncMock, return_value=None
            ),
        ):
            outline = await ai.generate_outline(
                "proj-generic",
                "生成“知识地图 + 关键例题 + 易错点澄清”风格大纲，12 页，强调课堂互动提问与板书逻辑。",
            )

        section_titles = [section.title for section in outline.sections]
        assert "知识地图构建" in section_titles
        assert "关键例题精讲" in section_titles
        assert "易错点澄清" in section_titles
        assert sum(section.slide_count for section in outline.sections) == 12
        merged_points = " ".join(
            point
            for section in outline.sections
            for point in (section.key_points or [])
        )
        assert "互动提问" in merged_points
        assert "板书逻辑" in merged_points

    def test_fallback_outline_structure(self):
        """fallback 大纲结构完整"""
        outline = AIService._get_fallback_outline("数学课件")
        assert outline.title == "数学课件"
        assert len(outline.sections) == 4
        assert outline.total_slides == 14
        section_titles = [s.title for s in outline.sections]
        assert "导入" in section_titles
        assert "总结" in section_titles


class TestExtractStructuredContent:
    """extract_structured_content() 测试"""

    @pytest.mark.asyncio
    async def test_with_provided_outline(self):
        """传入 outline 时不再调用 generate_outline"""
        ai = AIService()
        outline = CoursewareOutline(
            title="预设大纲",
            sections=[
                OutlineSection(title="章节1", key_points=["点1"], slide_count=3),
            ],
            total_slides=5,
        )
        mock_response = (
            "===PPT_CONTENT_START===\n# 预设大纲\n内容\n===PPT_CONTENT_END===\n"
            "===LESSON_PLAN_START===\n# 教学目标\n目标\n===LESSON_PLAN_END==="
        )

        with (
            patch.object(
                ai,
                "generate",
                new_callable=AsyncMock,
                return_value={"content": mock_response},
            ),
            patch.object(
                ai, "_retrieve_rag_context", new_callable=AsyncMock, return_value=None
            ),
            patch.object(
                ai, "generate_outline", new_callable=AsyncMock
            ) as mock_outline,
        ):
            result = await ai.extract_structured_content(
                "proj1", "测试", outline=outline
            )

        mock_outline.assert_not_called()
        assert isinstance(result, CoursewareContent)

    @pytest.mark.asyncio
    async def test_without_outline_generates_one(self):
        """未传入 outline 时自动生成"""
        ai = AIService()
        fallback_outline = AIService._get_fallback_outline("自动大纲")
        mock_response = (
            "===PPT_CONTENT_START===\n# 自动大纲\n内容\n===PPT_CONTENT_END===\n"
            "===LESSON_PLAN_START===\n# 教学目标\n目标\n===LESSON_PLAN_END==="
        )

        with (
            patch.object(
                ai,
                "generate",
                new_callable=AsyncMock,
                return_value={"content": mock_response},
            ),
            patch.object(
                ai, "_retrieve_rag_context", new_callable=AsyncMock, return_value=None
            ),
            patch.object(
                ai,
                "generate_outline",
                new_callable=AsyncMock,
                return_value=fallback_outline,
            ) as mock_outline,
        ):
            result = await ai.extract_structured_content("proj2", "自动大纲")

        mock_outline.assert_called_once()
        assert isinstance(result, CoursewareContent)

    @pytest.mark.asyncio
    async def test_rag_context_injected(self):
        """RAG 上下文被注入到 prompt"""
        ai = AIService()
        outline = CoursewareOutline(
            title="RAG测试",
            sections=[
                OutlineSection(title="章节1", key_points=["点1"], slide_count=2),
            ],
            total_slides=4,
        )
        rag_results = [{"content": "参考内容", "source": {"filename": "ref.pdf"}}]
        mock_response = (
            "===PPT_CONTENT_START===\n# RAG测试\n内容\n===PPT_CONTENT_END===\n"
            "===LESSON_PLAN_START===\n# 教学目标\n目标\n===LESSON_PLAN_END==="
        )

        with (
            patch.object(
                ai,
                "generate",
                new_callable=AsyncMock,
                return_value={"content": mock_response},
            ) as mock_gen,
            patch.object(
                ai,
                "_retrieve_rag_context",
                new_callable=AsyncMock,
                return_value=rag_results,
            ),
        ):
            await ai.extract_structured_content("proj3", "RAG测试", outline=outline)

        prompt_arg = mock_gen.call_args[1]["prompt"]
        assert "参考资料" in prompt_arg


class TestParseCoursewareResponse:
    """_parse_courseware_response() 解析健壮性测试"""

    def test_parse_with_outer_markdown_code_fence(self):
        ai = AIService()
        raw = """```markdown
===PPT_CONTENT_START===
# 线性代数

---

# 向量空间
- 基本定义
===PPT_CONTENT_END===

===LESSON_PLAN_START===
# 教学目标
- 理解向量空间定义
===LESSON_PLAN_END===
```"""
        result = ai._parse_courseware_response(raw, "线性代数")
        assert "向量空间" in result.markdown_content
        assert "教学目标" in result.lesson_plan_markdown

    def test_parse_with_relaxed_markers(self):
        ai = AIService()
        raw = """
===== PPT_CONTENT_START =====
# 计算机网络
---
# TCP/IP
===== PPT_CONTENT_END =====

===== LESSON_PLAN_START =====
# 教学目标
- 理解分层模型
===== LESSON_PLAN_END =====
"""
        result = ai._parse_courseware_response(raw, "计算机网络")
        assert "TCP/IP" in result.markdown_content
        assert "分层模型" in result.lesson_plan_markdown

    def test_parse_without_markers_uses_heading_split(self):
        ai = AIService()
        raw = """---
marp: true
theme: default
---

# 数据库系统

---

# 事务隔离级别
- RU / RC / RR / Serializable

# 教学目标
- 认识事务 ACID
- 理解隔离级别差异
"""
        result = ai._parse_courseware_response(raw, "数据库系统")
        assert "事务隔离级别" in result.markdown_content
        assert "ACID" in result.lesson_plan_markdown
