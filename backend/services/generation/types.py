"""Compatibility data shapes for markdown/render-adjacent helpers.

These models remain in ``services.generation`` only as a narrow compatibility
surface shared by local shell code and tests. They are not evidence that
Spectra still owns formal PPT generation or render authority.
"""

from typing import Dict, List, Optional

from pydantic import BaseModel


class PageClassItem(BaseModel):
    """单页 class 计划项"""

    slide_index: int
    page_type: str
    density: str
    class_name: str


class StyleManifest(BaseModel):
    """样式清单"""

    design_name: str
    palette: Dict[str, str]
    typography: Dict[str, str]
    page_variants: List[str]
    density_rules: Dict[str, str]


class CoursewareContent(BaseModel):
    """
    Compatibility contract for courseware-shaped markdown payloads.

    The local shell may still carry正文级 markdown、lesson-plan markdown and
    optional render-ready markdown, but formal PPT generation belongs to Diego
    and formal render/export belongs to Pagevra.
    """

    title: str
    markdown_content: str  # PPT 正文级 Markdown；不要求预先包含 Marp frontmatter
    lesson_plan_markdown: str  # 教案的 Markdown 内容
    render_markdown: Optional[str] = None  # 最终可渲染的完整 Marp 文档；优先用于渲染
    style_manifest: Optional[StyleManifest] = None
    extra_css: Optional[str] = None
    page_class_plan: Optional[List[PageClassItem]] = None
