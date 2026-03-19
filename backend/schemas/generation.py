from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TemplateStyle(str, Enum):
    """模板风格枚举"""

    DEFAULT = "default"
    GAIA = "gaia"
    UNCOVER = "uncover"
    ACADEMIC = "academic"


class TemplateConfig(BaseModel):
    """模板配置"""

    style: TemplateStyle = TemplateStyle.DEFAULT
    primary_color: str = "#3B82F6"
    enable_pagination: bool = True
    enable_header: bool = False
    enable_footer: bool = True


class GenerationType(str, Enum):
    """生成类型枚举"""

    PPTX = "pptx"
    DOCX = "docx"
    BOTH = "both"


class GenerationResultField(str, Enum):
    """Public result payload field names for generation outputs."""

    PPT_URL = "ppt_url"
    WORD_URL = "word_url"


_GENERATION_TYPE_ALIASES = {
    GenerationType.PPTX.value: GenerationType.PPTX,
    GenerationType.DOCX.value: GenerationType.DOCX,
    GenerationType.BOTH.value: GenerationType.BOTH,
}


def normalize_generation_type(value: str | GenerationType) -> GenerationType:
    """Normalize task/output type labels into the formal generation vocabulary."""

    if isinstance(value, GenerationType):
        return value
    normalized = _GENERATION_TYPE_ALIASES.get(str(value or "").strip().lower())
    if normalized is None:
        raise ValueError(f"Unsupported generation type: {value}")
    return normalized


def requires_pptx_output(value: str | GenerationType) -> bool:
    generation_type = normalize_generation_type(value)
    return generation_type in {GenerationType.PPTX, GenerationType.BOTH}


def requires_docx_output(value: str | GenerationType) -> bool:
    generation_type = normalize_generation_type(value)
    return generation_type in {GenerationType.DOCX, GenerationType.BOTH}


def build_task_output_urls(
    *,
    pptx_url: Optional[str] = None,
    docx_url: Optional[str] = None,
) -> Dict[str, str]:
    """Build canonical task output URLs keyed by formal generation type."""

    output_urls: Dict[str, str] = {}
    if pptx_url:
        output_urls[GenerationType.PPTX.value] = pptx_url
    if docx_url:
        output_urls[GenerationType.DOCX.value] = docx_url
    return output_urls


def build_generation_result_payload(
    *,
    ppt_url: Optional[str] = None,
    word_url: Optional[str] = None,
    version: Optional[int] = None,
) -> Dict[str, Optional[str] | Optional[int]]:
    """Build the public session/result payload for generation outputs."""

    return {
        GenerationResultField.PPT_URL.value: ppt_url,
        GenerationResultField.WORD_URL.value: word_url,
        "version": version,
    }


def build_generation_result_payload_from_output_urls(
    output_urls: Optional[Dict[str, str]],
    *,
    version: Optional[int] = None,
) -> Dict[str, Optional[str] | Optional[int]]:
    """Project internal task output URLs into the public result payload shape."""

    urls = output_urls or {}
    return build_generation_result_payload(
        ppt_url=urls.get(GenerationType.PPTX.value),
        word_url=urls.get(GenerationType.DOCX.value),
        version=version,
    )


def build_session_output_fields(
    output_urls: Optional[Dict[str, str]],
) -> Dict[str, Optional[str]]:
    """Map internal task output URLs to GenerationSession persistence fields."""

    urls = output_urls or {}
    return {
        "pptUrl": urls.get(GenerationType.PPTX.value),
        "wordUrl": urls.get(GenerationType.DOCX.value),
    }


class GenerateRequest(BaseModel):
    """课件生成请求"""

    project_id: str = Field(..., description="项目 ID")
    type: GenerationType = Field(GenerationType.BOTH, description="生成类型")
    template_config: Optional[TemplateConfig] = Field(None, description="模板配置")

    @field_validator("project_id")
    @classmethod
    def validate_project_id(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("project_id cannot be empty")
        return v


class TaskStatus(str, Enum):
    """任务状态枚举"""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class GenerateResponse(BaseModel):
    """课件生成响应"""

    task_id: str = Field(..., description="任务 ID")
    status: TaskStatus = Field(TaskStatus.PENDING, description="任务状态")
    message: str = Field("Generation task created", description="响应消息")


class GenerateStatusResponse(BaseModel):
    """任务状态查询响应"""

    model_config = ConfigDict(from_attributes=True)

    task_id: str = Field(..., description="任务 ID")
    status: TaskStatus = Field(..., description="任务状态")
    progress: int = Field(0, ge=0, le=100, description="进度百分比")
    result: Optional[Dict[str, str]] = Field(None, description="生成结果（文件 URL）")
    error: Optional[str] = Field(None, description="错误信息")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")


class CoursewareContent(BaseModel):
    """
    课件内容 - GenerationService 与 AI Service 的接口契约

    AI Service（成员 D）负责生成符合此格式的内容
    GenerationService（成员 A）负责将内容转换为文件
    """

    title: str = Field(..., description="课件标题")
    markdown_content: str = Field(
        ..., description="PPT 的 Markdown 内容（包含 Marp frontmatter）"
    )
    lesson_plan_markdown: str = Field(..., description="教案的 Markdown 内容")

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        if len(v) > 200:
            raise ValueError("Title too long (max 200 characters)")
        if not v.strip():
            raise ValueError("Title cannot be empty")
        return v

    @field_validator("markdown_content", "lesson_plan_markdown")
    @classmethod
    def validate_markdown(cls, v: str) -> str:
        if len(v) > 1_000_000:  # 1MB 限制
            raise ValueError("Markdown content too large (max 1MB)")
        # 检查潜在的注入攻击（不区分大小写）
        v_lower = v.lower()
        dangerous_patterns = [
            "<script",
            "<?php",
            "<%",
            "javascript:",
            "onerror=",
            "onload=",
        ]
        for pattern in dangerous_patterns:
            if pattern in v_lower:
                raise ValueError(f"Potentially dangerous content detected: {pattern}")
        return v


class ModifyRequest(BaseModel):
    """修改请求"""

    instruction: str = Field(..., description="修改指令")
    target_slides: Optional[List[int]] = Field(
        None, description="目标幻灯片页码（可选）"
    )

    @field_validator("instruction")
    @classmethod
    def validate_instruction(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Instruction cannot be empty")
        if len(v) > 1000:
            raise ValueError("Instruction too long (max 1000 characters)")
        return v


class SlidePreview(BaseModel):
    """幻灯片预览"""

    page_number: int = Field(..., description="页码")
    title: str = Field("", description="标题")
    content: str = Field(..., description="内容")


class PreviewResponse(BaseModel):
    """预览响应"""

    task_id: str = Field(..., description="任务 ID")
    slides: List[SlidePreview] = Field(..., description="幻灯片列表")
    lesson_plan: str = Field(..., description="教案内容")
