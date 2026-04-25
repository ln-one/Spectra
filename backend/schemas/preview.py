"""
Preview Schemas - 预览相关 Pydantic 模型

对齐 docs/openapi/schemas/preview.yaml 规范。
"""

from enum import Enum
from typing import Any, Literal, Optional

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

    retrieval_mode: Optional[str] = Field(
        None, description="检索模式: default_library 或 strict_sources"
    )
    page_semantic_type: Optional[str] = Field(None, description="页面语义类型")
    image_insertion_decision: Optional[str] = Field(
        None, description="插图决策: insert 或 skip"
    )
    image_count: Optional[int] = Field(None, ge=0, description="插图数量")
    image_slot: Optional[str] = Field(
        None, description="图位: left_split/right_split/bottom_panel"
    )
    layout_risk_level: Optional[str] = Field(
        None, description="版式风险等级: low/medium/high"
    )
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
    rendered_html_preview: Optional[str] = None
    rendered_previews: list["RenderedPreviewPage"] = Field(default_factory=list)
    image_metadata: Optional[ImageInsertionMetadata] = Field(
        None, description="插图决策元数据"
    )


class SvgPreviewManifest(BaseModel):
    index: int = Field(..., ge=0)
    slide_id: str
    format: str = "svg"
    svg_data_url: str
    width: Optional[int] = Field(None, ge=1)
    height: Optional[int] = Field(None, ge=1)


class RenderedPreviewPage(BaseModel):
    index: int = Field(..., ge=0)
    slide_id: str
    format: Optional[str] = None
    svg_data_url: Optional[str] = None
    preview: Optional[SvgPreviewManifest] = None
    image_url: Optional[str] = None
    html_preview: Optional[str] = Field(
        None,
        description="完整且可直接用于 iframe srcDoc 的安全 HTML 页面字符串",
    )
    status: Optional[str] = None
    split_index: int = Field(default=0, ge=0, description="该逻辑 slide 的第几分页")
    split_count: int = Field(default=1, ge=1, description="该逻辑 slide 展开的总分页数")
    width: Optional[int] = Field(None, ge=1)
    height: Optional[int] = Field(None, ge=1)


class RenderedPreview(BaseModel):
    format: str = "png"
    page_count: int = Field(default=0, ge=0)
    pages: list[RenderedPreviewPage] = Field(default_factory=list)


class DiegoPreviewTheme(BaseModel):
    primary: Optional[str] = None
    secondary: Optional[str] = None
    accent: Optional[str] = None
    light: Optional[str] = None
    bg: Optional[str] = None


class DiegoPreviewFonts(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None


class DiegoPreviewContext(BaseModel):
    provider: str = "diego"
    run_id: Optional[str] = None
    palette: Optional[str] = None
    style: Optional[str] = None
    style_dna_id: Optional[str] = None
    effective_template_style: Optional[str] = None
    source_event_seq: Optional[int] = Field(None, ge=1)
    theme: Optional[DiegoPreviewTheme] = None
    fonts: Optional[DiegoPreviewFonts] = None


class AuthorityPreviewBlock(BaseModel):
    block_id: str
    kind: str = Field(..., pattern="^(heading|paragraph|bullet_list|image)$")
    text: Optional[str] = None
    items: list[str] = Field(default_factory=list)
    src: Optional[str] = None
    alt: Optional[str] = None


class AuthorityPreviewFrame(BaseModel):
    slide_id: str
    index: int = Field(..., ge=0)
    split_index: int = Field(default=0, ge=0)
    split_count: int = Field(default=1, ge=1)
    status: Optional[str] = None
    format: Optional[str] = None
    svg_data_url: Optional[str] = None
    preview: Optional[SvgPreviewManifest] = None
    width: Optional[int] = Field(None, ge=1)
    height: Optional[int] = Field(None, ge=1)


class AuthorityPreviewViewport(BaseModel):
    width: Optional[int] = Field(None, ge=1)
    height: Optional[int] = Field(None, ge=1)


class AuthorityPreviewSlide(BaseModel):
    slide_id: str
    index: int = Field(..., ge=0)
    title: Optional[str] = None
    status: Optional[str] = None
    layout_kind: Optional[str] = None
    render_version: Optional[int] = Field(None, ge=1)
    format: Optional[str] = None
    svg_data_url: Optional[str] = None
    preview: Optional[SvgPreviewManifest] = None
    width: Optional[int] = Field(None, ge=1)
    height: Optional[int] = Field(None, ge=1)
    frames: list[AuthorityPreviewFrame] = Field(default_factory=list)
    editable_block_ids: list[str] = Field(default_factory=list)
    blocks: list[AuthorityPreviewBlock] = Field(default_factory=list)


class AuthorityPreview(BaseModel):
    provider: str = "pagevra"
    run_id: Optional[str] = None
    render_version: Optional[int] = Field(None, ge=1)
    viewport: Optional[AuthorityPreviewViewport] = None
    compile_context_version: Optional[int] = Field(None, ge=1)
    compile_context: Optional[DiegoPreviewContext] = None
    theme: Optional[DiegoPreviewTheme] = None
    fonts: Optional[DiegoPreviewFonts] = None
    slides: list[AuthorityPreviewSlide] = Field(default_factory=list)


class EditableSlideNodeBox(BaseModel):
    x: float
    y: float
    w: float
    h: float


class EditableSlideNode(BaseModel):
    node_id: str
    kind: Literal["text", "image"]
    label: str
    text: Optional[str] = None
    src: Optional[str] = None
    alt: Optional[str] = None
    bbox: Optional[EditableSlideNodeBox] = None
    style: dict[str, Any] = Field(default_factory=dict)
    edit_capabilities: list[str] = Field(default_factory=list)


class EditableSlideScene(BaseModel):
    run_id: str
    slide_id: str
    slide_index: int = Field(..., ge=0)
    slide_no: int = Field(..., ge=1)
    scene_version: str
    nodes: list[EditableSlideNode] = Field(default_factory=list)
    readonly: bool = False
    readonly_reason: Optional[str] = None


class SaveSlideSceneOperation(BaseModel):
    op: Literal["replace_text", "replace_image"]
    node_id: str
    value: str


class SaveSlideSceneRequest(BaseModel):
    scene_version: str = Field(..., min_length=1)
    operations: list[SaveSlideSceneOperation] = Field(
        default_factory=list, min_length=1
    )


class SaveSlideSceneData(BaseModel):
    run_id: str
    slide_id: str
    slide_index: int = Field(..., ge=0)
    slide_no: int = Field(..., ge=1)
    render_version: Optional[int] = Field(None, ge=1)
    status: str = "ready"
    scene: EditableSlideScene
    preview: dict[str, Any] = Field(default_factory=dict)


class PexelsSearchItem(BaseModel):
    id: str
    thumbnail_url: str
    full_url: str
    photographer: str = ""
    width: int = Field(default=0, ge=0)
    height: int = Field(default=0, ge=0)


class PexelsSearchData(BaseModel):
    query: str
    results: list[PexelsSearchItem] = Field(default_factory=list)


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
    artifact_id: Optional[str] = None
    based_on_version_id: Optional[str] = None
    current_version_id: Optional[str] = None
    upstream_updated: bool = False
    content: str
    format: str
    render_version: Optional[int] = Field(None, ge=1)
