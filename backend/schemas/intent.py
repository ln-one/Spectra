"""
Intent Schemas - 意图分类相关 Pydantic 模型
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class IntentType(str, Enum):
    """用户意图类型"""

    DESCRIBE_REQUIREMENT = "describe_requirement"
    ASK_QUESTION = "ask_question"
    MODIFY_COURSEWARE = "modify_courseware"
    CONFIRM_GENERATION = "confirm_generation"
    GENERAL_CHAT = "general_chat"


class IntentClassification(BaseModel):
    """意图分类结果"""

    intent: IntentType = Field(..., description="识别的意图类型")
    confidence: float = Field(..., ge=0, le=1, description="置信度")
    method: str = Field(
        default="llm", description="分类方法 (llm/keyword_fallback)"
    )


class ModifyIntent(BaseModel):
    """课件修改意图详情（Phase 4 扩展）"""

    modify_type: str = Field(
        ..., description="修改子类型 (content/style/structure/global)"
    )
    target_slides: Optional[list[str]] = Field(None, description="目标幻灯片编号")
    instruction: str = Field(..., description="修改指令")
