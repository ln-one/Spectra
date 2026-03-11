"""
通用 Schema 定义 - 能力状态与降级信息。

对齐 docs/openapi/schemas/common.yaml；历史对齐说明见 docs/archived/D_CONTRACT_V1.md。
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class CapabilityType(str, Enum):
    """能力类型枚举"""

    DOCUMENT_PARSER = "document_parser"
    VIDEO_UNDERSTANDING = "video_understanding"
    SPEECH_RECOGNITION = "speech_recognition"


class CapabilityStatusEnum(str, Enum):
    """能力状态枚举"""

    AVAILABLE = "available"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"


class ReasonCode(str, Enum):
    """统一原因码"""

    PROVIDER_TIMEOUT = "PROVIDER_TIMEOUT"
    PROVIDER_RATE_LIMITED = "PROVIDER_RATE_LIMITED"
    PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE"
    INVALID_INPUT_FORMAT = "INVALID_INPUT_FORMAT"
    UNSUPPORTED_FILE_TYPE = "UNSUPPORTED_FILE_TYPE"
    EMPTY_OUTPUT = "EMPTY_OUTPUT"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class CapabilityStatus(BaseModel):
    """能力执行状态与降级信息（统一字段）"""

    capability: CapabilityType = Field(..., description="能力标识")
    provider: str = Field(..., description="实际执行的 provider")
    status: CapabilityStatusEnum = Field(..., description="能力状态")
    fallback_used: bool = Field(..., description="是否发生降级")
    fallback_target: Optional[str] = Field(None, description="降级目标 provider")
    reason_code: Optional[ReasonCode] = Field(None, description="失败或降级原因码")
    user_message: Optional[str] = Field(None, description="可直接展示给用户的提示语")
    trace_id: Optional[str] = Field(None, description="链路追踪 ID")


class SourceType(str, Enum):
    """来源类型枚举"""

    DOCUMENT = "document"
    VIDEO = "video"
    AUDIO = "audio"
    AI_GENERATED = "ai_generated"


class SourceReference(BaseModel):
    """内容来源引用（用于溯源）"""

    chunk_id: str = Field(..., description="片段唯一标识")
    source_type: SourceType = Field(..., description="来源类型")
    filename: str = Field(..., description="源文件名")
    page_number: Optional[int] = Field(None, description="页码（文档场景）")
    timestamp: Optional[float] = Field(
        None, description="时间戳（视频/音频场景，单位秒）"
    )
    content_preview: Optional[str] = Field(None, description="内容预览片段")
