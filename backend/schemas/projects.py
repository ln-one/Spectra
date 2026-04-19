"""
Project Schemas

Request and response models for project endpoints.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from schemas.project_semantics import validate_project_sharing_rules
from schemas.project_vocabulary import ProjectReferenceMode, ProjectVisibility


class ProjectBase(BaseModel):
    """项目基础信息"""

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)
    grade_level: Optional[str] = None


class ProjectCreate(ProjectBase):
    """创建项目请求"""

    # Project Space 扩展字段
    base_project_id: Optional[str] = None  # 基底项目ID，创建时自动建立base引用
    reference_mode: Optional[ProjectReferenceMode] = Field(
        default=ProjectReferenceMode.FOLLOW
    )
    visibility: Optional[ProjectVisibility] = Field(default=ProjectVisibility.PRIVATE)
    is_referenceable: Optional[bool] = Field(default=True)  # 是否可被引用

    @model_validator(mode="after")
    def _validate_sharing_rules(self):
        try:
            validate_project_sharing_rules(self.visibility, self.is_referenceable)
        except ValueError as exc:
            raise PydanticCustomError("project_sharing_rules", str(exc))
        return self


class ProjectUpdate(BaseModel):
    """更新项目请求"""

    name: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)
    grade_level: Optional[str] = None

    # Project Space 扩展字段
    visibility: Optional[ProjectVisibility] = None  # private/shared
    is_referenceable: Optional[bool] = None  # 是否可被引用

    @model_validator(mode="after")
    def _validate_sharing_rules(self):
        if self.visibility is not None and self.is_referenceable is not None:
            try:
                validate_project_sharing_rules(self.visibility, self.is_referenceable)
            except ValueError as exc:
                raise PydanticCustomError("project_sharing_rules", str(exc))
        return self


class Project(ProjectBase):
    """项目实体"""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    name: str = Field(min_length=1, max_length=200)
    status: Optional[str] = None

    # Project Space 扩展字段
    visibility: Optional[ProjectVisibility] = Field(
        default=ProjectVisibility.PRIVATE, alias="visibility"
    )
    is_referenceable: Optional[bool] = Field(default=True, alias="isReferenceable")
    current_version_id: Optional[str] = Field(None, alias="currentVersionId")
    name_source: Optional[str] = Field(default=None, alias="nameSource")
    name_updated_at: Optional[datetime] = Field(default=None, alias="nameUpdatedAt")

    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None


class ProjectResponseData(BaseModel):
    project: Project


class ProjectResponse(BaseModel):
    success: bool = True
    data: ProjectResponseData
    message: str = "操作成功"


class ArtifactSourceCreateRequest(BaseModel):
    artifact_id: str = Field(min_length=1)
    surface_kind: Optional[str] = Field(default=None, max_length=100)


class ArtifactBackedSourceItem(BaseModel):
    id: str
    artifact_id: str
    artifact_type: str
    tool_type: str
    title: str
    surface_kind: Optional[str] = None
    filename: Optional[str] = None
    session_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ArtifactSourceResponseData(BaseModel):
    source: ArtifactBackedSourceItem


class ArtifactSourceResponse(BaseModel):
    success: bool = True
    data: ArtifactSourceResponseData
    message: str = "操作成功"


class ArtifactSourcesResponseData(BaseModel):
    sources: list[ArtifactBackedSourceItem]


class ArtifactSourcesResponse(BaseModel):
    success: bool = True
    data: ArtifactSourcesResponseData
    message: str = "操作成功"
