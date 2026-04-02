"""
课件生成服务 - 数据类型定义
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
    课件内容 - GenerationService 与 AI Service 的接口契约

    AI 服务（成员 D）输出课件正文级 Markdown 与教案 Markdown。
    生成服务（成员 A）在渲染前补充 Marp frontmatter 与模板样式，再转换为文件。
    """

    title: str
    markdown_content: str  # PPT 正文级 Markdown；不要求预先包含 Marp frontmatter
    lesson_plan_markdown: str  # 教案的 Markdown 内容
    style_manifest: Optional[StyleManifest] = None
    extra_css: Optional[str] = None
    page_class_plan: Optional[List[PageClassItem]] = None
