from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class StudioCardReadiness(str, Enum):
    READY = "ready"
    FOUNDATION_READY = "foundation_ready"
    PROTOCOL_PENDING = "protocol_pending"


class StudioCardContextMode(str, Enum):
    SESSION = "session"
    ARTIFACT = "artifact"
    HYBRID = "hybrid"


class StudioCardExecutionMode(str, Enum):
    SESSION_COMMAND = "session_command"
    ARTIFACT_CREATE = "artifact_create"
    COMPOSITE = "composite"


class StudioCardFieldType(str, Enum):
    SELECT = "select"
    MULTISELECT = "multiselect"
    BOOLEAN = "boolean"
    INTEGER = "integer"
    TEXT = "text"
    REFERENCE = "reference"


class StudioCardTransport(str, Enum):
    SESSION_CREATE = "session_create"
    ARTIFACT_CREATE = "artifact_create"
    CHAT_MESSAGE = "chat_message"
    ARTIFACT_REFERENCE = "artifact_reference"


class StudioCardBindingStatus(str, Enum):
    READY = "ready"
    PARTIAL = "partial"
    PENDING = "pending"


class StudioCardConfigOption(BaseModel):
    value: str
    label: str
    description: Optional[str] = None


class StudioCardConfigField(BaseModel):
    key: str
    label: str
    type: StudioCardFieldType
    required: bool = False
    options: List[StudioCardConfigOption] = Field(default_factory=list)
    placeholder: Optional[str] = None
    default_value: Optional[str | int | bool] = None
    notes: Optional[str] = None


class StudioCardAction(BaseModel):
    type: str
    label: str
    notes: Optional[str] = None


class StudioCardExecutionBinding(BaseModel):
    transport: StudioCardTransport
    status: StudioCardBindingStatus
    method: str
    endpoint: str
    required_fields: List[str] = Field(default_factory=list)
    bound_config_keys: List[str] = Field(default_factory=list)
    pending_config_keys: List[str] = Field(default_factory=list)
    result_fields: List[str] = Field(default_factory=list)
    notes: Optional[str] = None


class StudioCardCapability(BaseModel):
    id: str
    title: str
    readiness: StudioCardReadiness
    context_mode: StudioCardContextMode
    execution_mode: StudioCardExecutionMode
    primary_capabilities: List[str] = Field(default_factory=list)
    related_capabilities: List[str] = Field(default_factory=list)
    artifact_types: List[str] = Field(default_factory=list)
    session_output_type: Optional[str] = None
    requires_source_artifact: bool = False
    supports_chat_refine: bool = False
    supports_selection_context: bool = False
    config_fields: List[StudioCardConfigField] = Field(default_factory=list)
    actions: List[StudioCardAction] = Field(default_factory=list)
    notes: Optional[str] = None


class StudioCardExecutionPlan(BaseModel):
    card_id: str
    readiness: StudioCardReadiness
    initial_binding: StudioCardExecutionBinding
    refine_binding: Optional[StudioCardExecutionBinding] = None
    source_binding: Optional[StudioCardExecutionBinding] = None


class StudioCardExecutionPreviewRequest(BaseModel):
    project_id: str
    config: dict = Field(default_factory=dict)
    visibility: Optional[str] = None
    source_artifact_id: Optional[str] = None
    rag_source_ids: Optional[List[str]] = None
    client_session_id: Optional[str] = None
    run_id: Optional[str] = None


class StudioCardResolvedRequest(BaseModel):
    method: str
    endpoint: str
    payload: dict = Field(default_factory=dict)
    notes: Optional[str] = None


class StudioCardExecutionPreview(BaseModel):
    card_id: str
    readiness: StudioCardReadiness
    initial_request: StudioCardResolvedRequest
    refine_request: Optional[StudioCardResolvedRequest] = None
    source_request: Optional[StudioCardResolvedRequest] = None


class StudioCardExecutionPreviewResponse(BaseModel):
    success: bool = True
    data: dict
    message: str = "Studio 卡片执行预览获取成功"


class StudioCardExecutionResultKind(str, Enum):
    SESSION = "session"
    ARTIFACT = "artifact"


class StudioCardExecutionResult(BaseModel):
    card_id: str
    readiness: StudioCardReadiness
    transport: StudioCardTransport
    resource_kind: StudioCardExecutionResultKind
    session: Optional[dict] = None
    artifact: Optional[dict] = None
    run: Optional[dict] = None
    request_preview: StudioCardResolvedRequest


class StudioCardExecutionResponse(BaseModel):
    success: bool = True
    data: dict
    message: str = "Studio 卡片执行成功"


class StudioCardRefineRequest(BaseModel):
    project_id: str
    message: str = ""
    artifact_id: Optional[str] = None
    session_id: Optional[str] = None
    config: dict = Field(default_factory=dict)
    visibility: Optional[str] = None
    source_artifact_id: Optional[str] = None
    rag_source_ids: Optional[List[str]] = None


class StudioCardTurnRequest(BaseModel):
    project_id: str
    artifact_id: str
    teacher_answer: str
    config: dict = Field(default_factory=dict)
    rag_source_ids: Optional[List[str]] = None
    turn_anchor: Optional[str] = None


class StudioCardTurnResult(BaseModel):
    turn_anchor: str
    student_profile: str
    student_question: str
    teacher_answer: str
    feedback: str
    score: int
    next_focus: Optional[str] = None


class StudioCardTurnResponse(BaseModel):
    success: bool = True
    data: dict
    message: str = "Studio 卡片轮次推进成功"


class StudioCardSourceArtifact(BaseModel):
    id: str
    type: str
    title: Optional[str] = None
    visibility: Optional[str] = None
    based_on_version_id: Optional[str] = None
    session_id: Optional[str] = None
    updated_at: Optional[str] = None


class StudioCardSourceOptionsResponse(BaseModel):
    success: bool = True
    data: dict
    message: str = "Studio 卡片源成果获取成功"
