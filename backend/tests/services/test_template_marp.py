"""
Marp 模板测试

测试 Marp frontmatter 生成和 Markdown 包装功能
"""

import pytest

from services.template import TemplateConfig, TemplateService, TemplateStyle


@pytest.fixture
def template_service(tmp_path):
    """创建测试用的 TemplateService 实例"""
    return TemplateService(templates_dir=str(tmp_path / "templates"))


class TestTemplateServiceInit:
    """测试 TemplateService 初始化"""

    def test_init_creates_templates_dir(self, tmp_path):
        """测试初始化时创建模板目录"""
        templates_dir = tmp_path / "test_templates"
        service = TemplateService(templates_dir=str(templates_dir))

        assert templates_dir.exists()
        assert templates_dir.is_dir()


class TestMarpFrontmatter:
    """测试 Marp Frontmatter 生成"""

    def test_default_template_frontmatter(self, template_service):
        """测试默认模板的 frontmatter"""
        config = TemplateConfig()
        frontmatter = template_service.get_marp_frontmatter(config, "测试课件")

        assert "marp: true" in frontmatter
        assert "theme: default" in frontmatter
        assert "paginate: true" in frontmatter
        assert "footer:" in frontmatter

    def test_gaia_template_frontmatter(self, template_service):
        """测试 GAIA 模板的 frontmatter"""
        config = TemplateConfig(style=TemplateStyle.GAIA)
        frontmatter = template_service.get_marp_frontmatter(config, "测试课件")

        assert "theme: gaia" in frontmatter
        assert "backgroundColor:" in frontmatter
        assert "color:" in frontmatter

    def test_uncover_template_frontmatter(self, template_service):
        """测试 UNCOVER 模板的 frontmatter"""
        config = TemplateConfig(style=TemplateStyle.UNCOVER)
        frontmatter = template_service.get_marp_frontmatter(config, "测试课件")

        assert "theme: uncover" in frontmatter
        assert "class: invert" in frontmatter

    def test_academic_template_frontmatter(self, template_service):
        """测试 ACADEMIC 模板的 frontmatter"""
        config = TemplateConfig(style=TemplateStyle.ACADEMIC)
        frontmatter = template_service.get_marp_frontmatter(config, "测试课件")

        # Academic 使用 default 主题 + 自定义 CSS
        assert "theme: default" in frontmatter

    def test_pagination_disabled(self, template_service):
        """测试禁用页码"""
        config = TemplateConfig(enable_pagination=False)
        frontmatter = template_service.get_marp_frontmatter(config, "测试课件")

        assert "paginate: false" in frontmatter

    def test_header_enabled(self, template_service):
        """测试启用页眉"""
        config = TemplateConfig(enable_header=True)
        title = "Python 编程基础"
        frontmatter = template_service.get_marp_frontmatter(config, title)

        assert f"header: '{title}'" in frontmatter

    def test_footer_disabled(self, template_service):
        """测试禁用页脚"""
        config = TemplateConfig(enable_footer=False)
        frontmatter = template_service.get_marp_frontmatter(config, "测试课件")

        assert "footer:" not in frontmatter

    def test_custom_primary_color(self, template_service):
        """测试自定义主题色"""
        config = TemplateConfig(primary_color="#FF6B6B")
        frontmatter = template_service.get_marp_frontmatter(config, "测试课件")

        # 主题色在 CSS 中使用，不在 frontmatter 中
        assert "marp: true" in frontmatter


class TestWrapMarkdownWithTemplate:
    """测试 Markdown 包装功能"""

    def test_wrap_basic_markdown(self, template_service):
        """测试基础 Markdown 包装"""
        markdown = "# 标题\n\n内容"
        config = TemplateConfig()

        result = template_service.wrap_markdown_with_template(
            markdown, config, "测试课件"
        )

        # 验证包含 frontmatter
        assert "---" in result
        assert "marp: true" in result

        # 验证包含样式
        assert "<style>" in result
        assert "</style>" in result

        # 验证包含原始内容
        assert "# 标题" in result
        assert "内容" in result

    def test_wrap_with_different_styles(self, template_service):
        """测试不同风格的包装"""
        markdown = "# 测试"

        for style in TemplateStyle:
            config = TemplateConfig(style=style)
            result = template_service.wrap_markdown_with_template(
                markdown, config, "测试"
            )

            assert "marp: true" in result
            assert "# 测试" in result

    def test_wrap_preserves_markdown_structure(self, template_service):
        """测试包装保持 Markdown 结构"""
        markdown = """# 第一页

内容1

---

# 第二页

内容2
"""
        config = TemplateConfig()
        result = template_service.wrap_markdown_with_template(markdown, config, "测试")

        # 验证页面分隔符保留
        assert markdown in result
        assert result.count("---") >= 3  # frontmatter 的 --- + 内容中的 ---

    def test_wrap_with_all_options(self, template_service):
        """测试所有选项启用的包装"""
        markdown = "# 测试内容"
        config = TemplateConfig(
            style=TemplateStyle.GAIA,
            primary_color="#FF6B6B",
            enable_pagination=True,
            enable_header=True,
            enable_footer=True,
        )

        result = template_service.wrap_markdown_with_template(
            markdown, config, "完整测试"
        )

        assert "theme: gaia" in result
        assert "paginate: true" in result
        assert "header:" in result
        assert "footer:" in result
        assert "<style>" in result

    def test_wrap_strips_existing_marp_frontmatter(self, template_service):
        """AI 输出已包含 Marp frontmatter 时，不应重复注入导致空白首页"""
        markdown = """---
marp: true
theme: default
paginate: true
---

# 第一页

内容
"""
        config = TemplateConfig()
        result = template_service.wrap_markdown_with_template(markdown, config, "测试")

        # 应只保留一份 marp frontmatter
        assert result.count("marp: true") == 1
        assert "# 第一页" in result


class TestCSSGeneration:
    """测试 CSS 生成"""

    def test_css_contains_primary_color(self, template_service):
        """测试 CSS 包含主题色"""
        markdown = "# 测试"
        config = TemplateConfig(primary_color="#FF6B6B")

        result = template_service.wrap_markdown_with_template(markdown, config, "测试")

        # CSS 应该包含主题色
        assert "#FF6B6B" in result or "rgb(255, 107, 107)" in result

    def test_css_for_different_styles(self, template_service):
        """测试不同风格的 CSS"""
        markdown = "# 测试"

        for style in TemplateStyle:
            config = TemplateConfig(style=style)
            result = template_service.wrap_markdown_with_template(
                markdown, config, "测试"
            )

            # 所有风格都应该有 CSS
            assert "<style>" in result
            assert "</style>" in result
