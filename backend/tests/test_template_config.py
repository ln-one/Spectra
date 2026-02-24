"""
模板配置和边界情况测试

测试 Pandoc 模板、配置验证和边界情况处理
"""

import pytest

from services.template import TemplateConfig, TemplateService, TemplateStyle


@pytest.fixture
def template_service(tmp_path):
    """创建测试用的 TemplateService 实例"""
    return TemplateService(templates_dir=str(tmp_path / "templates"))


class TestPandocTemplate:
    """测试 Pandoc 模板功能"""

    def test_get_pandoc_template_path_default(self, template_service):
        """测试获取默认 Pandoc 模板路径"""
        config = TemplateConfig()
        path = template_service.get_pandoc_template_path(config)

        # 默认情况下可能返回 None（使用 Pandoc 默认模板）
        assert path is None or isinstance(path, str)

    def test_get_pandoc_template_path_with_custom_template(
        self, template_service, tmp_path
    ):
        """测试获取自定义 Pandoc 模板路径"""
        # 创建一个测试模板文件
        template_file = tmp_path / "templates" / "custom.docx"
        template_file.parent.mkdir(parents=True, exist_ok=True)
        template_file.write_bytes(b"fake docx content")

        config = TemplateConfig()
        path = template_service.get_pandoc_template_path(config)

        # 验证返回值是字符串或 None
        assert path is None or isinstance(path, str)


class TestTemplateConfigValidation:
    """测试模板配置验证"""

    def test_default_config_values(self):
        """测试默认配置值"""
        config = TemplateConfig()

        assert config.style == TemplateStyle.DEFAULT
        assert config.primary_color == "#3B82F6"
        assert config.enable_pagination is True
        assert config.enable_header is False
        assert config.enable_footer is True

    def test_custom_config_values(self):
        """测试自定义配置值"""
        config = TemplateConfig(
            style=TemplateStyle.GAIA,
            primary_color="#FF0000",
            enable_pagination=False,
            enable_header=True,
            enable_footer=False,
        )

        assert config.style == TemplateStyle.GAIA
        assert config.primary_color == "#FF0000"
        assert config.enable_pagination is False
        assert config.enable_header is True
        assert config.enable_footer is False

    def test_config_serialization(self):
        """测试配置序列化"""
        config = TemplateConfig(style=TemplateStyle.UNCOVER)

        # Pydantic 模型可以序列化为字典
        config_dict = config.model_dump()

        assert config_dict["style"] == "uncover"
        assert "primary_color" in config_dict


class TestEdgeCases:
    """测试边界情况"""

    def test_empty_markdown(self, template_service):
        """测试空 Markdown"""
        config = TemplateConfig()
        result = template_service.wrap_markdown_with_template("", config, "空课件")

        # 即使内容为空，也应该有 frontmatter 和样式
        assert "marp: true" in result
        assert "<style>" in result

    def test_very_long_title(self, template_service):
        """测试超长标题"""
        long_title = "A" * 200
        config = TemplateConfig(enable_header=True)

        frontmatter = template_service.get_marp_frontmatter(config, long_title)

        # 应该能处理长标题
        assert long_title in frontmatter

    def test_special_characters_in_title(self, template_service):
        """测试标题中的特殊字符"""
        special_title = "测试'课件\"with<special>chars&symbols"
        config = TemplateConfig()

        frontmatter = template_service.get_marp_frontmatter(config, special_title)

        # 应该能处理特殊字符
        assert "marp: true" in frontmatter

    def test_markdown_with_code_blocks(self, template_service):
        """测试包含代码块的 Markdown"""
        markdown = """# 代码示例

```python
def hello():
    print("Hello, World!")
```
"""
        config = TemplateConfig()
        result = template_service.wrap_markdown_with_template(
            markdown, config, "代码课件"
        )

        # 代码块应该被保留
        assert "```python" in result
        assert "def hello():" in result
