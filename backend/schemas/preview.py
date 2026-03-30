"""
Preview Schemas - 预览相关 Pydantic 模型

对齐 docs/openapi/schemas/preview.yaml 规范。
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from schemas.common import SourceType, normalize_source_type
from schemas.generation import TaskStatus


class SourceReference(BaseModel):
    """来源引用"""

    chunk_id: str
    source_type: SourceType = SourceType.AI_GENERATED
    filename: str = ""
    page_number: Optional[int] = Field(None, ge=1)
    timestamp: Optional[float] = Field(None, ge=0)
    preview_text: Optional[str] = None

    @field_validator("source_type", mode="before")
    @classmethod
    def _normalize_source_type(cls, value):
        return normalize_source_type(value)


class ImageInsertionMetadata(BaseModel):
    """插图决策元数据"""

    retrieval_mode: Optional[str] = Field(None, description="检索模式: default_library 或 strict_sources")
    page_semantic_type: Optional[str] = Field(None, description="页面语义类型")
    image_insertion_decision: Optional[str] = Field(None, description="插图决策: insert 或 skip")
    image_count: Optional[int] = Field(None, ge=0, description="插图数量")
    image_slot: Optional[str] = Field(None, description="图位: left_split/right_split/bottom_panel")
    layout_risk_level: Optional[str] = Field(None, description="版式风险等级: low/medium/high")
    image_match_reason: Optional[str] = Field(None, description="插图匹配原因")
    skip_reason: Optional[str] = Field(None, description="跳过插图原因")


class Slide(BaseModel):
    """幻灯片"""

    id: str
    index: int = Field(..., ge=0)
    title: str = ""
    content: str
    sources: list[SourceReference] = Field(default_factory=list)
    thumbnail_url: Optional[str] = None
    image_metadata: Optional[ImageInsertionMetadata] = Field(None, description="插图决策元数据")


class RenderedPreviewPage(BaseModel):
    index: int = Field(..., ge=0)
    slide_id: str
    image_url: str
    width: Optional[int] = Field(None, ge=1)
    height: Optional[int] = Field(None, ge=1)


class RenderedPreview(BaseModel):
    format: str = "png"
    page_count: int = Field(default=0, ge=0)
    pages: list[RenderedPreviewPage] = Field(default_factory=list)


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

    artifact_id: Optional[str] = None
    instruction: str = Field(..., min_length=1, max_length=2000)
    target_slides: Optional[list[int]] = None
    context: Optional[dict] = None
    base_render_version: Optional[int] = Field(None, ge=1)


class ModifyResponse(BaseModel):
    """修改响应 data 部分"""

    session_id: Optional[str] = None
    modify_task_id: str
    status: TaskStatus = TaskStatus.PENDING
    render_version: Optional[int] = Field(None, ge=1)
    artifact_id: Optional[str] = None
    based_on_version_id: Optional[str] = None
    current_version_id: Optional[str] = None
    upstream_updated: bool = False


class SlideDetailData(BaseModel):
    """幻灯片详情 data 部分"""

    session_id: Optional[str] = None
    slide: Slide
    teaching_plan: Optional[SlidePlan] = None
    related_slides: list[RelatedSlide] = Field(default_factory=list)
    rendered_page: Optional[RenderedPreviewPage] = None


class ExportFormat(str, Enum):
    """导出格式"""

    JSON = "json"
    MARKDOWN = "markdown"
    HTML = "html"


class ExportRequest(BaseModel):
    """导出请求"""

    artifact_id: Optional[str] = None
    format: ExportFormat = ExportFormat.MARKDOWN
    include_sources: bool = True
    expected_render_version: Optional[int] = Field(None, ge=1)


class ExportData(BaseModel):
    """导出响应 data 部分"""

    session_id: Optional[str] = None
    task_id: Optional[str] = None
    artifact_id: Optional[str] = None
    based_on_version_id: Optional[str] = None
    current_version_id: Optional[str] = None
    upstream_updated: bool = False
    content: str
    format: str
    render_version: Optional[int] = Field(None, ge=1)
