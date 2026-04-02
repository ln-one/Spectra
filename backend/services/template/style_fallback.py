"""
样式回退策略 - 当样式生成失败时使用后端规则生成默认 page_class_plan
"""

import logging
import re
from typing import List

logger = logging.getLogger(__name__)


def generate_fallback_page_class_plan(
    markdown_content: str, slide_count: int
) -> List[dict]:
    """
    根据正文内容生成默认 page_class_plan

    Args:
        markdown_content: 课件正文 Markdown
        slide_count: 幻灯片总数

    Returns:
        List[dict]: page_class_plan
    """
    slides = _split_slides(markdown_content)
    plan = []

    for idx, slide_content in enumerate(slides, start=1):
        page_type = _infer_page_type(idx, slide_content, slide_count)
        density = _estimate_density(slide_content, page_type)
        class_name = f"{page_type} density-{density}"

        plan.append(
            {
                "slide_index": idx,
                "page_type": page_type,
                "density": density,
                "class_name": class_name,
            }
        )

    logger.info(f"Generated fallback page_class_plan for {slide_count} slides")
    return plan


def _split_slides(markdown_content: str) -> List[str]:
    """按 Marp 分页符拆分 slides"""
    content = (markdown_content or "").strip()
    slides = re.split(r"\n---\n", content)
    return [s.strip() for s in slides if s.strip()]


def _infer_page_type(slide_index: int, content: str, total_slides: int) -> str:
    """推断页面类型"""
    if slide_index == 1:
        return "cover"

    # 检查是否为目录页
    if slide_index == 2 and total_slides >= 7:
        content_lower = content.lower()
        if any(
            keyword in content_lower
            for keyword in ["目录", "大纲", "outline", "agenda", "contents"]
        ):
            return "toc"

    return "content"


def _estimate_density(content: str, page_type: str) -> str:
    """估算内容密度"""
    if page_type == "cover":
        return "sparse"

    if page_type == "toc":
        return "medium"

    # 统计 bullet 数量和字数
    bullet_count = content.count("\n- ") + content.count("\n* ")
    char_count = len(content)

    if bullet_count <= 3 and char_count < 300:
        return "sparse"
    elif bullet_count >= 6 or char_count > 600:
        return "dense"
    else:
        return "medium"
