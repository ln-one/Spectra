"""
模板服务 - Marp 模板生成器
"""

import logging
import re
from typing import List, Optional

try:
    from .css_generator import (
        compile_manifest_css,
        generate_custom_css,
        generate_design_family_css,
    )
    from .style_fallback import generate_fallback_page_class_plan
    from .types import TemplateConfig, TemplateStyle
except ImportError:
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from services.template.css_generator import (
        compile_manifest_css,
        generate_custom_css,
        generate_design_family_css,
    )
    from services.template.style_fallback import generate_fallback_page_class_plan
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
    markdown_content: str,
    config: TemplateConfig,
    title: str,
    style_manifest: Optional[dict] = None,
    extra_css: Optional[str] = None,
    page_class_plan: Optional[List[dict]] = None,
) -> str:
    """
    将 Markdown 内容包装为完整的 Marp 文档

    Args:
        markdown_content: 原始 Markdown 内容
        config: 模板配置
        title: 课件标题
        style_manifest: 样式清单
        extra_css: 额外 CSS
        page_class_plan: 页面 class 计划

    Returns:
        str: 包含 frontmatter 和样式的完整 Markdown
    """
    frontmatter = generate_marp_frontmatter(config, title)
    normalized_markdown = _strip_existing_marp_frontmatter(markdown_content)

    # 生成样式 CSS
    if style_manifest and style_manifest.get("design_name"):
        design_css = generate_design_family_css(style_manifest["design_name"])
        manifest_css = compile_manifest_css(style_manifest)
    else:
        design_css = generate_custom_css(config)
        manifest_css = ""

    # 注入页面 class
    if page_class_plan:
        normalized_markdown = _inject_page_classes(normalized_markdown, page_class_plan)
    else:
        # 回退：生成默认 page_class_plan
        slides = _split_slides(normalized_markdown)
        fallback_plan = generate_fallback_page_class_plan(
            normalized_markdown, len(slides)
        )
        normalized_markdown = _inject_page_classes(normalized_markdown, fallback_plan)

    # 拼接完整文档
    css_block = f"<style>\n{design_css}\n"
    if manifest_css:
        css_block += f"\n{manifest_css}\n"
    if extra_css:
        css_block += f"\n{extra_css}\n"
    css_block += "</style>"

    full_markdown = f"{frontmatter}\n\n{css_block}\n\n{normalized_markdown}\n"
    logger.info(f"Wrapped markdown with template: {config.style}")
    return full_markdown


def _inject_page_classes(markdown_content: str, page_class_plan: List[dict]) -> str:
    """给每页注入 class 注释"""
    slides = _split_slides(markdown_content)
    class_map = {item["slide_index"]: item["class_name"] for item in page_class_plan}

    injected_slides = []
    for idx, slide_content in enumerate(slides, start=1):
        class_name = class_map.get(idx, "content density-medium")
        injected_slide = f"<!-- _class: {class_name} -->\n\n{slide_content}"
        injected_slides.append(injected_slide)

    return "\n\n---\n\n".join(injected_slides)


def _split_slides(markdown_content: str) -> List[str]:
    """按 Marp 分页符拆分 slides"""
    content = (markdown_content or "").strip()
    slides = re.split(r"\n---\n", content)
    return [s.strip() for s in slides if s.strip()]


def _strip_existing_marp_frontmatter(markdown_content: str) -> str:
    """
    去掉 AI 输出中可能重复的 Marp frontmatter，避免渲染出空白首页。
    """
    content = (markdown_content or "").strip()
    # 清掉模型偶发泄漏的 marker，避免被渲染成独立首页。
    content = re.sub(
        (
            r"(?im)^\s*(?:=+\s*)?"
            r"(PPT_CONTENT_START|PPT_CONTENT_END|LESSON_PLAN_START|LESSON_PLAN_END)"
            r"(?:\s*=+)?\s*$"
        ),
        "",
        content,
    ).strip()

    # 连续剥离文档开头的 Marp frontmatter，避免重复注入导致空白页/错位页。
    while True:
        fm_match = re.match(r"^\s*---\s*\n([\s\S]*?)\n---\s*\n?", content)
        if not fm_match:
            break
        frontmatter_body = fm_match.group(1).lower()
        if "marp:" not in frontmatter_body:
            break
        content = content[fm_match.end() :].lstrip()

    return content
