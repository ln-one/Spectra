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


class ChangeType(str, Enum):
    AUTHOR_UPDATE = "author-update"
    MERGE_CHANGE = "merge-change"
    REFERENCE_CHANGE = "reference-change"
    IMPORT = "import"


class ReferenceRelationType(str, Enum):
    BASE = "base"
    AUXILIARY = "auxiliary"


class ReferenceMode(str, Enum):
    FOLLOW = "follow"
    PINNED = "pinned"


class ReferenceStatus(str, Enum):
    ACTIVE = "active"
    DISABLED = "disabled"


class CandidateChangeStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class CandidateChangeReviewAction(str, Enum):
    ACCEPT = "accept"
    REJECT = "reject"


class ProjectMemberRole(str, Enum):
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


class ProjectMemberStatus(str, Enum):
    ACTIVE = "active"
    DISABLED = "disabled"


class ProjectPermission(str, Enum):
    VIEW = "can_view"
    REFERENCE = "can_reference"
    COLLABORATE = "can_collaborate"
    MANAGE = "can_manage"


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
    mode: Optional[str] = Field(default="create")
    content: Optional[Dict[str, Any]] = None


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
    relation_type: ReferenceRelationType
    mode: ReferenceMode
    pinned_version_id: Optional[str] = None
    priority: int = Field(default=0)


class ProjectReferenceCreate(ProjectReferenceBase):
    pass


class ProjectReferenceUpdate(BaseModel):
    mode: Optional[ReferenceMode] = None
    pinned_version_id: Optional[str] = None
    priority: Optional[int] = None
    status: Optional[ReferenceStatus] = None


class ProjectReference(ProjectReferenceBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    status: ReferenceStatus = ReferenceStatus.ACTIVE
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
    action: CandidateChangeReviewAction
    review_comment: Optional[str] = None


class CandidateChange(CandidateChangeBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    status: CandidateChangeStatus = CandidateChangeStatus.PENDING
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


PROJECT_PERMISSION_FIELDS = tuple(permission.value for permission in ProjectPermission)


class ProjectMemberBase(BaseModel):
    user_id: str
    role: ProjectMemberRole = ProjectMemberRole.VIEWER
    permissions: Optional[ProjectMemberPermissions] = None


class ProjectMemberCreate(ProjectMemberBase):
    pass


class ProjectMemberUpdate(BaseModel):
    role: Optional[ProjectMemberRole] = None
    permissions: Optional[ProjectMemberPermissions] = None
    status: Optional[ProjectMemberStatus] = None


class ProjectMember(ProjectMemberBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    status: ProjectMemberStatus = ProjectMemberStatus.ACTIVE
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
