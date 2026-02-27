"""Chat schema models aligned with OpenAPI contract."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class Message(BaseModel):
    """Single conversation message."""

    id: str = Field(..., description="消息 ID")
    role: str = Field(..., description="角色 (user/assistant/system)")
    content: str = Field(..., description="消息内容")
    timestamp: datetime = Field(..., description="时间戳")


class SendMessageRequest(BaseModel):
    """Request payload for sending chat messages."""

    project_id: str = Field(..., description="项目 ID")
    content: str = Field(..., min_length=1, max_length=10000, description="消息内容")
    history: Optional[list[Message]] = Field(None, description="对话历史")


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
