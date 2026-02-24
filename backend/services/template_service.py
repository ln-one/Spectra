"""
模板渲染服务

负责管理 Marp 主题和 Pandoc 模板
支持多种教学风格的课件模板

设计原则：
- 独立模块：不依赖数据库和其他服务
- 可扩展：易于添加新模板风格
- 配置驱动：通过配置对象控制样式
"""

import logging
from enum import Enum
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class TemplateStyle(str, Enum):
    """模板风格枚举"""

    DEFAULT = "default"  # Marp 默认主题
    GAIA = "gaia"  # Marp Gaia 主题（现代简约）
    UNCOVER = "uncover"  # Marp Uncover 主题（动态展示）
    ACADEMIC = "academic"  # 自定义学术风格（待实现）


class TemplateConfig(BaseModel):
    """模板配置"""

    style: TemplateStyle = TemplateStyle.DEFAULT
    primary_color: str = "#3B82F6"  # 主题色（蓝色）
    enable_pagination: bool = True  # 是否显示页码
    enable_header: bool = False  # 是否显示页眉
    enable_footer: bool = True  # 是否显示页脚


class TemplateService:
    """模板渲染服务 - 独立模块"""

    def __init__(self, templates_dir: str = "templates"):
        self.templates_dir = Path(templates_dir)
        self.templates_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"TemplateService initialized with templates_dir: {self.templates_dir}")

    def get_marp_frontmatter(self, config: TemplateConfig, title: str) -> str:
        """
        生成 Marp Frontmatter（YAML 头部）

        Args:
            config: 模板配置
            title: 课件标题

        Returns:
            str: Marp frontmatter 字符串

        示例输出：
            ---
            marp: true
            theme: default
            paginate: true
            header: ''
            footer: 'Spectra 智能课件'
            ---
        """
        frontmatter = f"""---
marp: true
theme: {config.style.value}
paginate: {str(config.enable_pagination).lower()}
"""

        if config.enable_header:
            frontmatter += f"header: '{title}'\n"

        if config.enable_footer:
            frontmatter += "footer: 'Spectra 智能课件'\n"

        frontmatter += "---\n"

        logger.debug(f"Generated Marp frontmatter for style: {config.style}")
        return frontmatter

    def get_custom_css(self, config: TemplateConfig) -> str:
        """
        生成自定义 CSS（用于覆盖 Marp 主题样式）

        Args:
            config: 模板配置

        Returns:
            str: CSS 样式字符串

        用法：
            在 Markdown 中添加：
            <style>
            {custom_css}
            </style>
        """
        css = f"""
section {{
  background-color: #ffffff;
}}

h1 {{
  color: {config.primary_color};
  border-bottom: 3px solid {config.primary_color};
  padding-bottom: 10px;
}}

h2 {{
  color: {config.primary_color};
}}

strong {{
  color: {config.primary_color};
}}
"""
        logger.debug(f"Generated custom CSS with primary color: {config.primary_color}")
        return css

    def get_pandoc_template_path(self, config: TemplateConfig) -> Optional[str]:
        """
        获取 Pandoc 模板路径

        Args:
            config: 模板配置

        Returns:
            str: 模板文件路径（如果存在）

        Pandoc 模板用法：
            pandoc input.md -o output.docx --reference-doc=template.docx
        """
        # TODO: Phase 2 实现自定义 Word 模板
        # template_file = self.templates_dir / f"{config.style.value}.docx"
        # if template_file.exists():
        #     return str(template_file)

        logger.debug("No custom Pandoc template, using default")
        return None

    def wrap_markdown_with_template(
        self, markdown_content: str, config: TemplateConfig, title: str
    ) -> str:
        """
        将 Markdown 内容包装为完整的 Marp 文档

        Args:
            markdown_content: 原始 Markdown 内容
            config: 模板配置
            title: 课件标题

        Returns:
            str: 包含 frontmatter 和样式的完整 Markdown

        示例：
            输入：# 第一页\n内容...
            输出：
                ---
                marp: true
                theme: default
                ---
                
                <style>
                ...
                </style>
                
                # 第一页
                内容...
        """
        frontmatter = self.get_marp_frontmatter(config, title)
        custom_css = self.get_custom_css(config)

        full_markdown = f"""{frontmatter}

<style>
{custom_css}
</style>

{markdown_content}
"""
        logger.info(f"Wrapped markdown with template: {config.style}")
        return full_markdown


# 全局服务实例
template_service = TemplateService()
