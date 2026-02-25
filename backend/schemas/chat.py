"""
Chat Schemas - 对话相关 Pydantic 模型

对齐 docs/openapi.yaml 中的 Chat 相关 Schema 定义。
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class Message(BaseModel):
    """对话消息"""

    id: str = Field(..., description="消息 ID")
    role: str = Field(..., description="角色 (user/assistant/system)")
    content: str = Field(..., description="消息内容")
    timestamp: datetime = Field(..., description="时间戳")


class SendMessageRequest(BaseModel):
    """发送消息请求"""

    project_id: str = Field(..., description="项目 ID")
    content: str = Field(..., min_length=1, max_length=10000, description="消息内容")
    history: Optional[list[Message]] = Field(None, description="对话历史")


class SendMessageResponse(BaseModel):
    """发送消息响应（data 部分）"""

    message: Message = Field(..., description="AI 回复消息")
    suggestions: Optional[list[str]] = Field(None, description="建议后续问题")
