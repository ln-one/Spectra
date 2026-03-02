"""
Preview Schemas - 预览相关 Pydantic 模型

对齐 docs/openapi/schemas/preview.yaml 规范。
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class SourceType(str, Enum):
    """来源类型"""

    VIDEO = "video"
    DOCUMENT = "document"
    AI_GENERATED = "ai_generated"


class SourceReference(BaseModel):
    """来源引用"""

    chunk_id: str
    source_type: SourceType = SourceType.AI_GENERATED
    filename: str = ""
    page_number: Optional[int] = None
    timestamp: Optional[str] = None
    preview_text: Optional[str] = None


class Slide(BaseModel):
    """幻灯片"""

    id: str
    index: int = Field(..., ge=0)
    title: str = ""
    content: str
    sources: list[SourceReference] = Field(default_factory=list)
    thumbnail_url: Optional[str] = None


class SlidePlan(BaseModel):
    """单页教学计划"""

    slide_id: str
    teaching_goal: str = ""
    teacher_script: str = ""
    teaching_suggestions: list[str] = Field(default_factory=list)
    suggested_duration: Optional[int] = Field(None, ge=1, le=180)
    material_sources: list[SourceReference] = Field(default_factory=list)


class LessonPlan(BaseModel):
    """教案结构"""

    teaching_objectives: list[str] = Field(default_factory=list)
    slides_plan: list[SlidePlan] = Field(default_factory=list)


class RelatedSlide(BaseModel):
    """相关幻灯片"""

    slide_id: str
    title: str = ""
    relation: str = Field(..., pattern="^(previous|next|related)$")


class ModifyRequest(BaseModel):
    """修改请求"""

    instruction: str = Field(..., min_length=1, max_length=2000)
    target_slides: Optional[list[int]] = None
    context: Optional[dict] = None


class ModifyResponse(BaseModel):
    """修改响应 data 部分"""

    modify_task_id: str
    status: str = "pending"


class SlideDetailData(BaseModel):
    """幻灯片详情 data 部分"""

    slide: Slide
    teaching_plan: Optional[SlidePlan] = None
    related_slides: list[RelatedSlide] = Field(default_factory=list)


class ExportFormat(str, Enum):
    """导出格式"""

    JSON = "json"
    MARKDOWN = "markdown"
    HTML = "html"


class ExportRequest(BaseModel):
    """导出请求"""

    format: ExportFormat = ExportFormat.MARKDOWN
    include_sources: bool = True


class ExportData(BaseModel):
    """导出响应 data 部分"""

    content: str
    format: str
