"""
通用 Schema 定义 - 能力状态与降级信息。

对齐 docs/openapi/schemas/common.yaml；历史对齐说明见 docs/archived/specs/D_CONTRACT_V1.md。
"""

from enum import Enum
from typing import Any, Mapping, Optional

from pydantic import BaseModel, Field


class CapabilityType(str, Enum):
    """能力类型枚举"""

    DOCUMENT_PARSER = "document_parser"
    VIDEO_UNDERSTANDING = "video_understanding"
    SPEECH_RECOGNITION = "speech_recognition"
    ANIMATION_RENDERING = "animation_rendering"


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
    WEB = "web"
    AI_GENERATED = "ai_generated"


_SOURCE_TYPE_ALIASES: dict[str, "SourceType"] = {}


def normalize_source_type(value: Any) -> "SourceType":
    """Normalize legacy file/source labels into the product source vocabulary."""

    if isinstance(value, SourceType):
        return value
    raw = str(value or "document").strip().lower()
    if not _SOURCE_TYPE_ALIASES:
        _SOURCE_TYPE_ALIASES.update(
            {
                SourceType.DOCUMENT.value: SourceType.DOCUMENT,
                SourceType.VIDEO.value: SourceType.VIDEO,
                SourceType.AUDIO.value: SourceType.AUDIO,
                SourceType.WEB.value: SourceType.WEB,
                SourceType.AI_GENERATED.value: SourceType.AI_GENERATED,
                "pdf": SourceType.DOCUMENT,
                "word": SourceType.DOCUMENT,
                "ppt": SourceType.DOCUMENT,
                "image": SourceType.DOCUMENT,
                "other": SourceType.DOCUMENT,
                "doc": SourceType.DOCUMENT,
                "docx": SourceType.DOCUMENT,
                "pptx": SourceType.DOCUMENT,
                "txt": SourceType.DOCUMENT,
                "md": SourceType.DOCUMENT,
                "csv": SourceType.DOCUMENT,
                "webpage": SourceType.WEB,
                "url": SourceType.WEB,
                "link": SourceType.WEB,
            }
        )
    return _SOURCE_TYPE_ALIASES.get(raw, SourceType.DOCUMENT)


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


def build_source_reference_payload(
    *,
    chunk_id: Any,
    source_type: Any,
    filename: Any,
    page_number: Any = None,
    timestamp: Any = None,
    score: Any = None,
    content_preview: Any = None,
    source_scope: Any = None,
    source_library_id: Any = None,
    source_library_name: Any = None,
    source_artifact_id: Any = None,
    source_artifact_title: Any = None,
    source_artifact_tool_type: Any = None,
    source_artifact_session_id: Any = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "chunk_id": str(chunk_id),
        "source_type": normalize_source_type(source_type).value,
        "filename": str(filename or ""),
    }
    if page_number is not None:
        payload["page_number"] = page_number
    if timestamp is not None:
        payload["timestamp"] = timestamp
    if score is not None:
        payload["score"] = score
    if content_preview is not None:
        payload["content_preview"] = content_preview
    if source_scope is not None:
        payload["source_scope"] = str(source_scope)
    if source_library_id is not None:
        payload["source_library_id"] = str(source_library_id)
    if source_library_name is not None:
        payload["source_library_name"] = str(source_library_name)
    if source_artifact_id is not None:
        payload["source_artifact_id"] = str(source_artifact_id)
    if source_artifact_title is not None:
        payload["source_artifact_title"] = str(source_artifact_title)
    if source_artifact_tool_type is not None:
        payload["source_artifact_tool_type"] = str(source_artifact_tool_type)
    if source_artifact_session_id is not None:
        payload["source_artifact_session_id"] = str(source_artifact_session_id)
    return payload


def extract_source_reference_payload(
    value: Mapping[str, Any] | BaseModel | Any,
) -> dict[str, Any]:
    if isinstance(value, BaseModel):
        raw = value.model_dump()
    elif isinstance(value, Mapping):
        raw = dict(value)
    else:
        raw = {
            "chunk_id": getattr(value, "chunk_id", None),
            "source_type": getattr(value, "source_type", None),
            "filename": getattr(value, "filename", None),
            "page_number": getattr(value, "page_number", None),
            "timestamp": getattr(value, "timestamp", None),
            "content_preview": getattr(value, "content_preview", None)
            or getattr(value, "preview_text", None),
            "score": getattr(value, "score", None),
            "source_scope": getattr(value, "source_scope", None),
            "source_library_id": getattr(value, "source_library_id", None),
            "source_library_name": getattr(value, "source_library_name", None),
            "source_artifact_id": getattr(value, "source_artifact_id", None),
            "source_artifact_title": getattr(value, "source_artifact_title", None),
            "source_artifact_tool_type": getattr(
                value, "source_artifact_tool_type", None
            ),
            "source_artifact_session_id": getattr(
                value, "source_artifact_session_id", None
            ),
        }

    return build_source_reference_payload(
        chunk_id=raw.get("chunk_id", ""),
        source_type=raw.get("source_type"),
        filename=raw.get("filename", ""),
        page_number=raw.get("page_number"),
        timestamp=raw.get("timestamp"),
        score=raw.get("score"),
        content_preview=raw.get("content_preview") or raw.get("preview_text"),
        source_scope=raw.get("source_scope"),
        source_library_id=raw.get("source_library_id"),
        source_library_name=raw.get("source_library_name"),
        source_artifact_id=raw.get("source_artifact_id"),
        source_artifact_title=raw.get("source_artifact_title"),
        source_artifact_tool_type=raw.get("source_artifact_tool_type"),
        source_artifact_session_id=raw.get("source_artifact_session_id"),
    )
