"""
模板服务 - Marp 模板生成器
"""

import logging

try:
    from .css_generator import generate_custom_css
    from .types import TemplateConfig, TemplateStyle
except ImportError:
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from services.template.css_generator import generate_custom_css
    from services.template.types import TemplateConfig, TemplateStyle

logger = logging.getLogger(__name__)


def generate_marp_frontmatter(config: TemplateConfig, title: str) -> str:
    """
    生成 Marp Frontmatter（YAML 头部）

    Args:
        config: 模板配置
        title: 课件标题

    Returns:
        str: Marp frontmatter 字符串
    """
    frontmatter = f"""---
marp: true
theme: {config.style.value}
paginate: {str(config.enable_pagination).lower()}
"""

    # 根据不同主题添加特定配置
    if config.style == TemplateStyle.GAIA:
        frontmatter += "backgroundColor: #ffffff\n"
        frontmatter += "color: #333333\n"
    elif config.style == TemplateStyle.UNCOVER:
        frontmatter += "class: invert\n"
    elif config.style == TemplateStyle.ACADEMIC:
        # Academic 主题使用 default 主题 + 自定义 CSS
        frontmatter = frontmatter.replace("theme: academic", "theme: default")

    if config.enable_header:
        frontmatter += f"header: '{title}'\n"

    if config.enable_footer:
        frontmatter += "footer: 'Spectra 智能课件'\n"

    frontmatter += "---\n"

    logger.debug(f"Generated Marp frontmatter for style: {config.style}")
    return frontmatter


def wrap_markdown_with_template(
    markdown_content: str, config: TemplateConfig, title: str
) -> str:
    """
    将 Markdown 内容包装为完整的 Marp 文档

    Args:
        markdown_content: 原始 Markdown 内容
        config: 模板配置
        title: 课件标题

    Returns:
        str: 包含 frontmatter 和样式的完整 Markdown
    """
    frontmatter = generate_marp_frontmatter(config, title)
    custom_css = generate_custom_css(config)

    full_markdown = f"""{frontmatter}

<style>
{custom_css}
</style>

{markdown_content}
"""
    logger.info(f"Wrapped markdown with template: {config.style}")
    return full_markdown
