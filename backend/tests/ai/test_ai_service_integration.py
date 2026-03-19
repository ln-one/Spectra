"""
测试 AI Service 与课件生成的集成

验证 AI Service 能够正确生成符合接口契约的课件内容
"""

import pytest

from schemas.generation import CoursewareContent
from services.ai import AIService

MOCK_COURSEWARE_RESPONSE = """===PPT_CONTENT_START===
# Python 编程基础

课程导入与目标说明

---

# 核心概念

- 变量与数据类型
- 控制流
- 函数与集合

===PPT_CONTENT_END===

===LESSON_PLAN_START===
# 教学目标

- 理解 Python 基础概念
- 完成简单示例练习

# 教学过程

## 导入环节（5分钟）

说明课程目标与学习路径。

## 讲授环节（30分钟）

讲解变量、控制流、函数与集合。

## 总结环节（10分钟）

回顾重点并布置练习。

===LESSON_PLAN_END==="""


@pytest.fixture(autouse=True)
def stub_ai_and_rag(monkeypatch):
    """默认把真实 AI/RAG 调用替换为快速 stub，避免集成测试被外部依赖拖慢。"""

    async def _fake_generate(
        self,
        prompt: str,
        model=None,
        route_task=None,
        has_rag_context: bool = False,
        max_tokens=None,
    ):
        return {
            "content": MOCK_COURSEWARE_RESPONSE,
            "model": "test-stub-model",
            "tokens_used": 128,
            "route": {
                "task": route_task,
                "selected_model": model or "test-stub-model",
                "has_rag_context": has_rag_context,
            },
            "fallback_triggered": False,
            "latency_ms": 1.0,
        }

    async def _fake_rag_context(
        self,
        project_id: str,
        query: str,
        top_k: int = 5,
        score_threshold: float = 0.3,
    ):
        return None

    monkeypatch.setattr(AIService, "generate", _fake_generate)
    monkeypatch.setattr(AIService, "_retrieve_rag_context", _fake_rag_context)


class TestAIServiceIntegration:
    """测试 AI Service 集成"""

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_generate_courseware_content_basic(self):
        """测试基本的课件内容生成"""
        ai_service = AIService()

        result = await ai_service.generate_courseware_content(
            project_id="test_proj_001",
            user_requirements="Python 基础编程",
            template_style="default",
        )

        # 验证返回类型
        assert isinstance(result, CoursewareContent)

        # 验证必填字段
        assert result.title
        assert result.markdown_content
        assert result.lesson_plan_markdown

        # 验证标题长度
        assert len(result.title) <= 200

        # 验证内容不为空
        assert len(result.markdown_content) > 0
        assert len(result.lesson_plan_markdown) > 0

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_generate_courseware_content_with_empty_requirements(self):
        """测试空需求的处理"""
        ai_service = AIService()

        result = await ai_service.generate_courseware_content(
            project_id="test_proj_002",
            user_requirements="",
            template_style="default",
        )

        # 应该返回默认内容
        assert isinstance(result, CoursewareContent)
        assert result.title
        assert result.markdown_content
        assert result.lesson_plan_markdown

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_generate_courseware_content_no_requirements(self):
        """测试没有提供需求的情况"""
        ai_service = AIService()

        result = await ai_service.generate_courseware_content(
            project_id="test_proj_003",
            user_requirements=None,
            template_style="default",
        )

        # 应该返回默认内容
        assert isinstance(result, CoursewareContent)
        assert result.title

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_courseware_content_validation(self):
        """测试生成的内容符合验证规则"""
        ai_service = AIService()

        result = await ai_service.generate_courseware_content(
            project_id="test_proj_004",
            user_requirements="数据结构与算法",
            template_style="gaia",
        )

        # 验证内容大小限制
        assert len(result.markdown_content) <= 1_000_000
        assert len(result.lesson_plan_markdown) <= 1_000_000

        # 验证没有危险内容
        dangerous_patterns = ["<script>", "<?php", "<%"]
        for pattern in dangerous_patterns:
            assert pattern not in result.markdown_content.lower()
            assert pattern not in result.lesson_plan_markdown.lower()

    @pytest.mark.asyncio
    async def test_fallback_courseware(self):
        """测试 fallback 课件生成"""
        ai_service = AIService()

        # 直接调用 fallback 方法
        result = ai_service._get_fallback_courseware("测试主题")

        assert isinstance(result, CoursewareContent)
        assert "测试主题" in result.title
        assert result.markdown_content
        assert result.lesson_plan_markdown

        # 验证 fallback 内容包含基本结构
        assert "#" in result.markdown_content  # 有标题
        assert "---" in result.markdown_content  # 有幻灯片分隔符
        assert "教学目标" in result.lesson_plan_markdown
        assert "教学过程" in result.lesson_plan_markdown

    @pytest.mark.asyncio
    async def test_parse_courseware_response(self):
        """测试解析 LLM 响应"""
        ai_service = AIService()

        # 模拟 LLM 返回的格式化内容
        mock_response = """===PPT_CONTENT_START===
# 测试课件

欢迎学习

---

# 第一章

- 要点 1
- 要点 2

===PPT_CONTENT_END===

===LESSON_PLAN_START===
# 教学目标

- 知识目标：理解基本概念
- 技能目标：掌握基本方法

# 教学过程

## 导入环节（5分钟）

内容...

===LESSON_PLAN_END==="""

        result = ai_service._parse_courseware_response(mock_response, "测试课件")

        assert isinstance(result, CoursewareContent)
        assert result.title == "测试课件"
        assert "第一章" in result.markdown_content
        assert "教学目标" in result.lesson_plan_markdown

    @pytest.mark.asyncio
    async def test_parse_malformed_response(self):
        """测试解析格式错误的响应"""
        ai_service = AIService()

        # 模拟格式错误的响应
        malformed_response = """这是一些没有正确格式的内容
# 标题
内容...
"""

        result = ai_service._parse_courseware_response(malformed_response, "测试")

        # 应该返回有效的 CoursewareContent，即使解析失败
        assert isinstance(result, CoursewareContent)
        assert result.title
        assert result.markdown_content
        assert result.lesson_plan_markdown

    @pytest.mark.asyncio
    async def test_build_courseware_prompt(self):
        """测试 prompt 构建（已迁移至 PromptService）"""
        from services.prompt_service import prompt_service

        prompt = prompt_service.build_courseware_prompt("Python 编程基础", "default")

        # 验证 prompt 包含关键信息
        assert "Python 编程基础" in prompt
        assert "PPT_CONTENT" in prompt
        assert "LESSON_PLAN" in prompt
        assert "Marp" in prompt
        assert "教学目标" in prompt

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_different_template_styles(self):
        """测试不同模板风格"""
        ai_service = AIService()

        styles = ["default", "gaia", "uncover", "academic"]

        for style in styles:
            result = await ai_service.generate_courseware_content(
                project_id=f"test_proj_{style}",
                user_requirements="测试课件",
                template_style=style,
            )

            assert isinstance(result, CoursewareContent)
            assert result.title
            assert result.markdown_content
            assert result.lesson_plan_markdown

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_markdown_structure(self):
        """测试生成的 Markdown 结构"""
        ai_service = AIService()

        result = await ai_service.generate_courseware_content(
            project_id="test_proj_structure",
            user_requirements="Web 开发基础",
            template_style="default",
        )

        # PPT Markdown 应该包含幻灯片分隔符
        assert "---" in result.markdown_content or "#" in result.markdown_content

        # 教案应该包含标题
        assert "#" in result.lesson_plan_markdown

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_long_requirements(self):
        """测试长需求描述"""
        ai_service = AIService()

        long_requirements = """
        这是一个非常详细的课程需求描述。
        我们需要教授 Python 编程的基础知识，包括：
        1. 变量和数据类型
        2. 控制流（if/else, for, while）
        3. 函数定义和调用
        4. 列表和字典
        5. 文件操作
        6. 异常处理

        目标学生是初学者，没有编程经验。
        课程时长为 45 分钟。
        """

        result = await ai_service.generate_courseware_content(
            project_id="test_proj_long",
            user_requirements=long_requirements,
            template_style="default",
        )

        assert isinstance(result, CoursewareContent)
        assert result.title
        assert len(result.title) <= 200  # 标题应该被截断到合理长度
