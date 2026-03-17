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

    # Project Space 扩展字段
    base_project_id: Optional[str] = None  # 基底项目ID，创建时自动建立base引用
    reference_mode: Optional[str] = Field(default="follow")  # follow/pinned，默认follow
    visibility: Optional[str] = Field(default="private")  # private/shared
    is_referenceable: Optional[bool] = Field(default=False)  # 是否可被引用


class ProjectUpdate(BaseModel):
    """更新项目请求"""

    name: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)
    grade_level: Optional[str] = None

    # Project Space 扩展字段
    visibility: Optional[str] = None  # private/shared
    is_referenceable: Optional[bool] = None  # 是否可被引用


class Project(ProjectBase):
    """项目实体"""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    status: Optional[str] = None

    # Project Space 扩展字段
    visibility: Optional[str] = Field(default="private", alias="visibility")
    is_referenceable: Optional[bool] = Field(default=False, alias="isReferenceable")
    current_version_id: Optional[str] = Field(None, alias="currentVersionId")

    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None


class ProjectResponseData(BaseModel):
    project: Project


class ProjectResponse(BaseModel):
    success: bool = True
    data: ProjectResponseData
    message: str = "操作成功"
