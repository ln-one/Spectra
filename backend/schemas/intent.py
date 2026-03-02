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
    method: str = Field(default="llm", description="分类方法 (llm/keyword_fallback)")


class ModifyType(str, Enum):
    """修改子类型"""

    CONTENT = "content"  # 改文字内容
    STYLE = "style"  # 改模板/风格
    STRUCTURE = "structure"  # 加减页/调整结构
    GLOBAL = "global"  # 改主题/全局修改


class ModifyIntent(BaseModel):
    """课件修改意图详情"""

    modify_type: ModifyType = Field(..., description="修改子类型")
    target_slides: Optional[list[int]] = Field(
        None, description="目标幻灯片页码（1-based）"
    )
    instruction: str = Field(..., description="修改指令")
