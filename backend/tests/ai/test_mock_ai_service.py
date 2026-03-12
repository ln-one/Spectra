"""
测试 Mock AI Service

验证 Mock 数据符合接口契约
"""

import pytest

from schemas.generation import CoursewareContent
from tests.mocks import (
    CODE_BLOCKS_COURSEWARE,
    COMPLEX_COURSEWARE,
    IMAGES_COURSEWARE,
    PYTHON_LIST_DICT_COURSEWARE,
    SIMPLE_COURSEWARE,
    MockAIService,
)


class TestMockAIService:
    """测试 Mock AI Service"""

    def test_simple_courseware_structure(self):
        """测试简单课件的数据结构"""
        content = SIMPLE_COURSEWARE

        # 验证类型
        assert isinstance(content, CoursewareContent)

        # 验证必填字段
        assert content.title
        assert content.markdown_content
        assert content.lesson_plan_markdown

        # 验证标题长度
        assert len(content.title) <= 200

        # 验证内容大小
        assert len(content.markdown_content) <= 1_000_000
        assert len(content.lesson_plan_markdown) <= 1_000_000

    def test_python_list_dict_courseware(self):
        """测试 Python 列表和字典课件"""
        content = PYTHON_LIST_DICT_COURSEWARE

        assert content.title == "Python 列表和字典 - 基础操作"
        assert "列表" in content.markdown_content
        assert "字典" in content.markdown_content
        assert "教学目标" in content.lesson_plan_markdown
        assert "教学过程" in content.lesson_plan_markdown

    def test_complex_courseware_size(self):
        """测试复杂课件的大小"""
        content = COMPLEX_COURSEWARE

        # 验证包含大量内容
        assert len(content.markdown_content) > 1000
        assert len(content.lesson_plan_markdown) > 300  # 调整为更合理的值

        # 验证包含多个幻灯片分隔符
        assert content.markdown_content.count("---") >= 40

    def test_code_blocks_courseware(self):
        """测试包含代码块的课件"""
        content = CODE_BLOCKS_COURSEWARE

        # 验证包含代码块
        assert "```python" in content.markdown_content
        assert "def " in content.markdown_content

    def test_images_courseware(self):
        """测试包含图片的课件"""
        content = IMAGES_COURSEWARE

        # 验证包含图片标记
        assert "![" in content.markdown_content
        assert "](http" in content.markdown_content

    def test_generate_simple_courseware_custom(self):
        """测试生成自定义简单课件"""
        content = MockAIService.generate_simple_courseware(
            title="自定义测试", num_slides=3
        )

        assert content.title == "自定义测试"
        assert "自定义测试" in content.markdown_content
        # 3 个章节 = 2 个分隔符（首页不需要分隔符）
        assert content.markdown_content.count("---") == 2

    def test_generate_complex_courseware_custom(self):
        """测试生成自定义复杂课件"""
        num_slides = 20
        content = MockAIService.generate_complex_courseware(num_slides=num_slides)

        assert f"{num_slides}页" in content.title
        # num_slides - 1 个分隔符
        assert content.markdown_content.count("---") == num_slides - 1

    @pytest.mark.asyncio
    async def test_generate_courseware_content_python(self):
        """测试根据需求生成课件 - Python 列表"""
        content = await MockAIService.generate_courseware_content(
            project_id="test_proj",
            user_requirements="Python 列表和字典的使用",
            template_style="default",
        )

        assert isinstance(content, CoursewareContent)
        assert "列表" in content.markdown_content or "字典" in content.markdown_content

    @pytest.mark.asyncio
    async def test_generate_courseware_content_function(self):
        """测试根据需求生成课件 - 函数"""
        content = await MockAIService.generate_courseware_content(
            project_id="test_proj",
            user_requirements="Python 函数编程",
            template_style="default",
        )

        assert "函数" in content.markdown_content
        assert "```python" in content.markdown_content

    @pytest.mark.asyncio
    async def test_generate_courseware_content_visualization(self):
        """测试根据需求生成课件 - 可视化"""
        content = await MockAIService.generate_courseware_content(
            project_id="test_proj",
            user_requirements="数据可视化入门",
            template_style="default",
        )

        assert "可视化" in content.markdown_content
        assert "![" in content.markdown_content

    @pytest.mark.asyncio
    async def test_generate_courseware_content_default(self):
        """测试根据需求生成课件 - 默认情况"""
        content = await MockAIService.generate_courseware_content(
            project_id="test_proj",
            user_requirements="随机主题测试",
            template_style="default",
        )

        assert isinstance(content, CoursewareContent)
        assert content.title
        assert content.markdown_content
        assert content.lesson_plan_markdown

    def test_no_dangerous_content(self):
        """测试所有 Mock 数据不包含危险内容"""
        test_contents = [
            SIMPLE_COURSEWARE,
            PYTHON_LIST_DICT_COURSEWARE,
            COMPLEX_COURSEWARE,
            CODE_BLOCKS_COURSEWARE,
            IMAGES_COURSEWARE,
        ]

        dangerous_patterns = ["<script>", "<?php", "<%"]

        for content in test_contents:
            for pattern in dangerous_patterns:
                assert pattern not in content.markdown_content.lower()
                assert pattern not in content.lesson_plan_markdown.lower()

    def test_markdown_format_validity(self):
        """测试 Markdown 格式的基本有效性"""
        content = PYTHON_LIST_DICT_COURSEWARE

        # PPT Markdown 应该包含幻灯片分隔符
        assert "---" in content.markdown_content

        # 应该包含标题
        assert "#" in content.markdown_content

        # 教案应该包含标题
        assert "#" in content.lesson_plan_markdown

    def test_lesson_plan_structure(self):
        """测试教案结构的完整性"""
        content = PYTHON_LIST_DICT_COURSEWARE

        # 验证教案包含必要的部分
        required_sections = ["教学目标", "教学重点", "教学过程"]

        for section in required_sections:
            assert (
                section in content.lesson_plan_markdown
            ), f"教案缺少必要部分: {section}"

    def test_ppt_slide_count(self):
        """测试 PPT 幻灯片数量"""
        content = PYTHON_LIST_DICT_COURSEWARE

        # 计算幻灯片数量（分隔符数量 + 1）
        slide_count = content.markdown_content.count("---") + 1

        # 验证幻灯片数量合理（通常 5-20 页）
        assert 5 <= slide_count <= 20, f"幻灯片数量不合理: {slide_count}"
