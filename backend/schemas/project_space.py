"""
Project Space Schemas

Request and response models for project space endpoints.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ArtifactType(str, Enum):
    PPTX = "pptx"
    DOCX = "docx"
    MINDMAP = "mindmap"
    SUMMARY = "summary"
    EXERCISE = "exercise"
    HTML = "html"
    GIF = "gif"
    MP4 = "mp4"


class ArtifactVisibility(str, Enum):
    PRIVATE = "private"
    PROJECT_VISIBLE = "project-visible"
    SHARED = "shared"


class ArtifactCreateType(str, Enum):
    PPTX = "pptx"
    DOCX = "docx"
    MINDMAP = "mindmap"
    SUMMARY = "summary"
    EXERCISE = "exercise"
    HTML = "html"
    GIF = "gif"
    MP4 = "mp4"


class ArtifactCreateMode(str, Enum):
    CREATE = "create"
    REPLACE = "replace"
    ANIMATION_STORYBOARD = "animation_storyboard"


class ChangeType(str, Enum):
    AUTHOR_UPDATE = "author-update"
    MERGE_CHANGE = "merge-change"
    REFERENCE_CHANGE = "reference-change"
    IMPORT = "import"


class ProjectVersion(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    parent_version_id: Optional[str] = None
    summary: Optional[str] = None
    change_type: ChangeType
    snapshot_data: Optional[Dict[str, Any]] = None
    created_by: Optional[str] = None
    created_at: datetime


class ProjectVersionResponseData(BaseModel):
    version: ProjectVersion


class ProjectVersionResponse(BaseModel):
    success: bool = True
    data: ProjectVersionResponseData
    message: str = "操作成功"


class ProjectVersionsResponseData(BaseModel):
    versions: List[ProjectVersion]


class ProjectVersionsResponse(BaseModel):
    success: bool = True
    data: ProjectVersionsResponseData
    message: str = "操作成功"


class ArtifactBase(BaseModel):
    type: ArtifactCreateType = Field(...)
    visibility: ArtifactVisibility = Field(default=ArtifactVisibility.PRIVATE)
    session_id: Optional[str] = None
    based_on_version_id: Optional[str] = None


class ArtifactCreate(ArtifactBase):
    mode: ArtifactCreateMode = Field(default=ArtifactCreateMode.CREATE)


class Artifact(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    session_id: Optional[str] = None
    based_on_version_id: Optional[str] = None
    owner_user_id: Optional[str] = None
    type: ArtifactType
    visibility: ArtifactVisibility
    storage_path: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


class ArtifactResponseData(BaseModel):
    artifact: Artifact


class ArtifactResponse(BaseModel):
    success: bool = True
    data: ArtifactResponseData
    message: str = "操作成功"


class ArtifactsResponseData(BaseModel):
    artifacts: List[Artifact]


class ArtifactsResponse(BaseModel):
    success: bool = True
    data: ArtifactsResponseData
    message: str = "操作成功"


class ProjectReferenceBase(BaseModel):
    target_project_id: str
    relation_type: str
    mode: str
    pinned_version_id: Optional[str] = None
    priority: int = Field(default=0)


class ProjectReferenceCreate(ProjectReferenceBase):
    pass


class ProjectReferenceUpdate(BaseModel):
    mode: Optional[str] = None
    pinned_version_id: Optional[str] = None
    priority: Optional[int] = None
    status: Optional[str] = None


class ProjectReference(ProjectReferenceBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    status: str = "active"
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ProjectReferenceResponseData(BaseModel):
    reference: ProjectReference


class ProjectReferenceResponse(BaseModel):
    success: bool = True
    data: ProjectReferenceResponseData
    message: str = "操作成功"


class ProjectReferencesResponseData(BaseModel):
    references: List[ProjectReference]


class ProjectReferencesResponse(BaseModel):
    success: bool = True
    data: ProjectReferencesResponseData
    message: str = "操作成功"


class SimpleSuccessResponse(BaseModel):
    success: bool = True
    data: Dict[str, Any] = Field(default_factory=dict)
    message: str = "操作成功"


class CandidateChangeBase(BaseModel):
    title: str
    summary: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = None
    base_version_id: Optional[str] = None


class CandidateChangeCreate(CandidateChangeBase):
    pass


class CandidateChangeReview(BaseModel):
    action: str
    review_comment: Optional[str] = None


class CandidateChange(CandidateChangeBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    status: str = "pending"
    review_comment: Optional[str] = None
    accepted_version_id: Optional[str] = None
    proposer_user_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CandidateChangeResponseData(BaseModel):
    change: CandidateChange


class CandidateChangeResponse(BaseModel):
    success: bool = True
    data: CandidateChangeResponseData
    message: str = "操作成功"


class CandidateChangesResponseData(BaseModel):
    changes: List[CandidateChange]


class CandidateChangesResponse(BaseModel):
    success: bool = True
    data: CandidateChangesResponseData
    message: str = "操作成功"


class ProjectMemberPermissions(BaseModel):
    can_view: bool = True
    can_reference: bool = False
    can_collaborate: bool = False
    can_manage: bool = False


class ProjectMemberBase(BaseModel):
    user_id: str
    role: str = "viewer"
    permissions: Optional[ProjectMemberPermissions] = None


class ProjectMemberCreate(ProjectMemberBase):
    pass


class ProjectMemberUpdate(BaseModel):
    role: Optional[str] = None
    permissions: Optional[ProjectMemberPermissions] = None
    status: Optional[str] = None


class ProjectMember(ProjectMemberBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    status: str = "active"
    created_at: datetime


class ProjectMemberResponseData(BaseModel):
    member: ProjectMember


class ProjectMemberResponse(BaseModel):
    success: bool = True
    data: ProjectMemberResponseData
    message: str = "操作成功"


class ProjectMembersResponseData(BaseModel):
    members: List[ProjectMember]


class ProjectMembersResponse(BaseModel):
    success: bool = True
    data: ProjectMembersResponseData
    message: str = "操作成功"
