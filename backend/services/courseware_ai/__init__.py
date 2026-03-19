"""课件生成 AI 模块出口。"""

from .generation import ALLOW_COURSEWARE_FALLBACK
from .mixin import CoursewareAIMixin

__all__ = ["ALLOW_COURSEWARE_FALLBACK", "CoursewareAIMixin"]
