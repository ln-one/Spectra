"""Chat schema models aligned with OpenAPI contract."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from schemas.common import SourceType, normalize_source_type


class ChatRouteTask(str, Enum):
    CHAT_RESPONSE = "chat_response"
    SPEECH_RECOGNITION = "speech_recognition"


class SourceReference(BaseModel):
    """来源引用（用于 citations 字段）。"""

    chunk_id: str = Field(..., description="分块 ID")
    source_type: SourceType = Field(..., description="来源类型")
    filename: str = Field(..., description="原始文件名")
    page_number: Optional[int] = Field(None, description="页码（文档场景）")
    timestamp: Optional[float] = Field(None, description="时间戳秒数（视频/语音场景）")
    score: Optional[float] = Field(None, description="相似度得分")

    @field_validator("source_type", mode="before")
    @classmethod
    def _normalize_source_type(cls, value):
        return normalize_source_type(value)


class Message(BaseModel):
    """Single conversation message."""

    id: str = Field(..., description="消息 ID")
    role: str = Field(..., description="角色 (user/assistant/system)")
    content: str = Field(..., description="消息内容")
    timestamp: datetime = Field(..., description="时间戳")
    citations: Optional[list[SourceReference]] = Field(
        None,
        description="assistant 回复关联的来源引用（RAG 命中时填充）",
    )


class SendMessageRequest(BaseModel):
    """Request payload for sending chat messages."""

    project_id: str = Field(..., description="项目 ID")
    session_id: Optional[str] = Field(
        None,
        description=(
            "会话级上下文隔离 ID（推荐）。提供时服务端按 session 范围检索历史与资料，"
            "避免同一 project 下多个生成流程相互污染。"
        ),
    )
    content: str = Field(..., min_length=1, max_length=10000, description="消息内容")
    metadata: Optional[dict] = Field(
        None,
        description="可选上下文元数据，用于卡片 refine、选区锚点或来源绑定等场景。",
    )
    history: Optional[list[Message]] = Field(None, description="对话历史")
    rag_source_ids: Optional[list[str]] = Field(
        None,
        description="限定 RAG 检索范围的文件 ID 列表（空列表/None 表示不限）",
    )


class SendMessageResponse(BaseModel):
    """Response data shape for send message endpoint."""

    message: Message = Field(..., description="AI 回复消息")
    suggestions: Optional[list[str]] = Field(None, description="后续建议")


class GetMessagesResponse(BaseModel):
    """Response data shape for get messages endpoint."""

    messages: list[Message] = Field(..., description="消息列表")
    total: int = Field(..., description="总数")
    page: int = Field(..., description="当前页码")
    limit: int = Field(..., description="每页数量")


class VoiceMessageResponse(BaseModel):
    """Response data shape for voice message endpoint."""

    text: str = Field(..., description="识别文本")
    confidence: float = Field(..., ge=0, le=1, description="识别置信度")
    duration: float = Field(..., description="音频时长（秒）")
    message: Message = Field(..., description="自动创建的消息")
    suggestions: Optional[list[str]] = Field(None, description="后续建议")


class ChatRouteDecision(BaseModel):
    task: str = Field(..., description="路由任务类型")
    complexity: str = Field(..., description="路由复杂度等级")
    selected_model: str = Field(..., description="路由选中的主模型")
    fallback_model: str = Field(..., description="路由回退模型")
    reason: str = Field(..., description="路由选择原因")
    failure_reason: Optional[str] = Field(None, description="执行失败原因")
    original_model: Optional[str] = Field(None, description="失败前原始模型")
    fallback_triggered: Optional[bool] = Field(None, description="是否发生回退")
    latency_ms: Optional[float] = Field(None, description="路由链路耗时")

    @field_validator("*", mode="before")
    @classmethod
    def _normalize_enum_values(cls, value):
        if isinstance(value, Enum):
            return value.value
        return value


class ChatObservability(BaseModel):
    request_id: str = Field(..., description="请求追踪 ID")
    route_task: str = Field(..., description="聊天侧任务路由类型")
    selected_model: str = Field(..., description="实际选中的模型")
    has_rag_context: bool = Field(..., description="是否命中 RAG 上下文")
    fallback_triggered: bool = Field(..., description="是否触发了降级回退")
    latency_ms: Optional[float] = Field(None, description="链路耗时（毫秒）")
    provider_model: Optional[str] = Field(None, description="底层 provider 模型")
    prompt_hash: Optional[str] = Field(None, description="提示词摘要")
    response_hash: Optional[str] = Field(None, description="响应摘要")
    mechanical_pattern_hit: Optional[bool] = Field(
        None, description="是否命中过于机械的回复模式"
    )
    route_decision: Optional[ChatRouteDecision] = Field(
        None, description="模型路由决策详情"
    )
    prompt_template_version: Optional[str] = Field(None, description="prompt 模板版本")
    few_shot_version: Optional[str] = Field(None, description="few-shot 模板版本")

    @field_validator("route_task", mode="before")
    @classmethod
    def _normalize_route_task(cls, value):
        if isinstance(value, Enum):
            return value.value
        return str(value)

    @field_validator("route_decision", mode="before")
    @classmethod
    def _normalize_route_decision(cls, value):
        if value == {}:
            return None
        return value
