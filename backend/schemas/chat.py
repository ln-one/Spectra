"""Chat schema models aligned with OpenAPI contract."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class SourceReference(BaseModel):
    """来源引用（用于 citations 字段）。"""

    chunk_id: str = Field(..., description="分块 ID")
    source_type: str = Field(..., description="来源类型：document/video/ai_generated")
    filename: str = Field(..., description="原始文件名")
    page_number: Optional[int] = Field(None, description="页码（文档场景）")
    timestamp: Optional[float] = Field(None, description="时间戳秒数（视频/语音场景）")
    score: Optional[float] = Field(None, description="相似度得分")


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
