from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class QualityIssue(BaseModel):
    """单条质量问题"""

    level: str = Field(..., pattern="^(error|warning|info)$")
    slide_index: Optional[int] = None
    message: str


class QualityReport(BaseModel):
    """质量评估报告"""

    score: float = Field(..., ge=0, le=100)
    issues: list[QualityIssue] = Field(default_factory=list)
    summary: str = ""
