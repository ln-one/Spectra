from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class ChapterSchema(BaseModel):
    """Schema for a course chapter"""

    title: str
    content: Optional[str] = None
    order: int


class CourseBase(BaseModel):
    """Base Course schema"""

    title: str
    chapters: List[ChapterSchema] = Field(default_factory=list)


class CourseCreate(CourseBase):
    """Schema for creating a Course"""


class CourseResponse(CourseBase):
    """Schema for Course response"""

    id: str
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True


class ProjectBase(BaseModel):
    """Base Project schema"""

    name: str
    description: Optional[str] = None


class ProjectCreate(ProjectBase):
    """Schema for creating a Project"""


class ProjectResponse(ProjectBase):
    """Schema for Project response"""

    id: str
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True


class UploadResponse(BaseModel):
    """Schema for file upload response"""

    id: str
    filename: str
    filepath: str
    size: int
    createdAt: datetime

    class Config:
        from_attributes = True


class GenerateRequest(BaseModel):
    """Schema for AI generation request"""

    prompt: str
    model: Optional[str] = "gpt-3.5-turbo"
    max_tokens: Optional[int] = 500


class GenerateResponse(BaseModel):
    """Schema for AI generation response"""

    content: str
    model: str
    tokens_used: Optional[int] = None
