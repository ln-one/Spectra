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


class ArtifactMutationMode(str, Enum):
    CREATE = "create"
    REPLACE = "replace"


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
    SUPERSEDED = "superseded"


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
    projectId: str
    parentVersionId: Optional[str] = None
    summary: Optional[str] = None
    changeType: ChangeType
    snapshotData: Optional[Dict[str, Any]] = None
    createdBy: Optional[str] = None
    createdAt: datetime


class ProjectVersionResponseData(BaseModel):
    version: ProjectVersion


class ProjectVersionResponse(BaseModel):
    version: ProjectVersion


class ProjectVersionsResponse(BaseModel):
    versions: List[ProjectVersion]
    currentVersionId: Optional[str] = None


class ArtifactBase(BaseModel):
    type: ArtifactCreateType = Field(...)
    visibility: ArtifactVisibility = Field(default=ArtifactVisibility.PRIVATE)
    session_id: Optional[str] = None
    based_on_version_id: Optional[str] = None


class ArtifactCreate(ArtifactBase):
    mode: ArtifactMutationMode = Field(default=ArtifactMutationMode.CREATE)
    content: Optional[Dict[str, Any]] = None


class Artifact(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    projectId: str
    sessionId: Optional[str] = None
    basedOnVersionId: Optional[str] = None
    ownerUserId: Optional[str] = None
    type: ArtifactType
    visibility: ArtifactVisibility
    storagePath: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    createdAt: datetime
    updatedAt: datetime


class ArtifactResponse(BaseModel):
    artifact: Optional[Artifact] = None


class ArtifactsResponse(BaseModel):
    artifacts: List[Artifact]


class ProjectReferenceBase(BaseModel):
    target_project_id: str = Field(..., min_length=1)
    relation_type: ReferenceRelationType
    mode: ReferenceMode
    pinned_version_id: Optional[str] = None
    priority: int = Field(default=0, ge=0, le=100)


class ProjectReferenceCreate(ProjectReferenceBase):
    pass


class ProjectReferenceUpdate(BaseModel):
    mode: Optional[ReferenceMode] = None
    pinned_version_id: Optional[str] = None
    priority: Optional[int] = None
    status: Optional[ReferenceStatus] = None


class ProjectReference(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    projectId: str
    targetProjectId: str
    targetProjectName: Optional[str] = None
    relationType: ReferenceRelationType
    mode: ReferenceMode
    pinnedVersionId: Optional[str] = None
    priority: int = 0
    status: ReferenceStatus = ReferenceStatus.ACTIVE
    createdBy: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime


class ProjectReferenceResponse(BaseModel):
    reference: ProjectReference


class ProjectReferencesResponse(BaseModel):
    references: List[ProjectReference]


class SimpleSuccessResponse(BaseModel):
    ok: bool = True


class CandidateChangeBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    summary: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = None
    base_version_id: Optional[str] = None


class CandidateChangeCreate(CandidateChangeBase):
    pass


class CandidateChangeReview(BaseModel):
    action: CandidateChangeReviewAction
    review_comment: Optional[str] = None


class CandidateChange(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    projectId: str
    sessionId: Optional[str] = None
    baseVersionId: Optional[str] = None
    title: str
    summary: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    changeKind: Optional[str] = None
    changeContext: Optional[Dict[str, Any]] = None
    acceptedSnapshot: Optional[Dict[str, Any]] = None
    status: CandidateChangeStatus = CandidateChangeStatus.PENDING
    reviewComment: Optional[str] = None
    reviewedBy: Optional[str] = None
    reviewedAt: Optional[datetime] = None
    acceptedVersionId: Optional[str] = None
    proposerUserId: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime


class CandidateChangeResponse(BaseModel):
    change: CandidateChange


class CandidateChangesResponse(BaseModel):
    changes: List[CandidateChange]


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


class ProjectMember(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    projectId: str
    userId: str
    role: ProjectMemberRole = ProjectMemberRole.VIEWER
    permissions: Optional[ProjectMemberPermissions] = None
    status: ProjectMemberStatus = ProjectMemberStatus.ACTIVE
    createdAt: datetime


class ProjectMemberResponse(BaseModel):
    member: ProjectMember


class ProjectMembersResponse(BaseModel):
    members: List[ProjectMember]
