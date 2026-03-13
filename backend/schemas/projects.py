"""
Project Schemas

Request and response models for project endpoints.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ProjectBase(BaseModel):
    """项目基础信息"""

    name: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)
    grade_level: Optional[str] = None


class ProjectCreate(ProjectBase):
    """创建项目请求"""


class ProjectUpdate(BaseModel):
    """更新项目请求"""

    name: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)
    grade_level: Optional[str] = None


class Project(ProjectBase):
    """项目实体"""

    model_config = ConfigDict(from_attributes=True)

    id: str
    status: Optional[str] = None
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None


class ProjectResponseData(BaseModel):
    project: Project


class ProjectResponse(BaseModel):
    success: bool = True
    data: ProjectResponseData
    message: str = "操作成功"
