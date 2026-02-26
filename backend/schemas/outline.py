"""
课件大纲 Schema

用于结构化大纲生成，让用户在生成前确认/调整大纲。
"""

from typing import Optional

from pydantic import BaseModel, Field


class OutlineSection(BaseModel):
    """大纲章节"""

    title: str = Field(..., description="章节标题")
    key_points: list[str] = Field(default_factory=list, description="关键知识点")
    slide_count: int = Field(default=2, ge=1, le=10, description="建议幻灯片数量")


class CoursewareOutline(BaseModel):
    """课件大纲"""

    title: str = Field(..., description="课件总标题")
    sections: list[OutlineSection] = Field(..., min_length=1, description="章节列表")
    total_slides: Optional[int] = Field(None, description="预计总页数")
    summary: Optional[str] = Field(None, description="大纲概述")
