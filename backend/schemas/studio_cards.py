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


class ArtifactSurfaceType(str, Enum):
    DOCUMENT = "document"
    TELEPROMPTER = "teleprompter"
    GRAPH = "graph"
    FLASHCARD = "flashcard"
    SIMULATOR = "simulator"
    SANDBOX = "sandbox"
    ANIMATION = "animation"


class CapabilityEngine(str, Enum):
    RICH_TEXT = "rich_text"
    NODE_GRAPH = "node_graph"
    SINGLE_ITEM = "single_item"
    SIMULATION_LOOP = "simulation_loop"
    SANDBOX_HTML = "sandbox_html"
    MEDIA_TIMELINE = "media_timeline"


class RefineMode(str, Enum):
    CHAT_REFINE = "chat_refine"
    STRUCTURED_REFINE = "structured_refine"
    FOLLOW_UP_TURN = "follow_up_turn"


class SelectionScope(str, Enum):
    NONE = "none"
    PAGE = "page"
    PARAGRAPH = "paragraph"
    NODE = "node"
    QUESTION = "question"
    SCENE = "scene"


class ExecutionCarrier(str, Enum):
    SESSION = "session"
    ARTIFACT = "artifact"
    HYBRID = "hybrid"


class SourceBindingMode(str, Enum):
    NONE = "none"
    SINGLE_ARTIFACT = "single_artifact"
    MULTI_ARTIFACT = "multi_artifact"


class StudioCardGovernanceTag(str, Enum):
    HARDEN = "harden"
    BORROW = "borrow"
    FREEZE = "freeze"
    DEFER = "defer"
    SEPARATE_TRACK = "separate-track"


class StudioCardCleanupPriority(str, Enum):
    P0 = "p0"
    P1 = "p1"
    P2 = "p2"
    P3 = "p3"


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


class StudioCardHealthReport(BaseModel):
    authority_integrity: int = Field(ge=1, le=5)
    builder_thinness: int = Field(ge=1, le=5)
    surface_maturity: int = Field(ge=1, le=5)
    fallback_residue: int = Field(ge=1, le=5)
    test_coverage: int = Field(ge=1, le=5)
    replaceability: int = Field(ge=1, le=5)
    summary: str


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
    governance_tag: Optional[StudioCardGovernanceTag] = None
    cleanup_priority: Optional[StudioCardCleanupPriority] = None
    surface_strategy: Optional[str] = None
    frozen: bool = False
    health_report: Optional[StudioCardHealthReport] = None
    context_mode: StudioCardContextMode
    execution_mode: StudioCardExecutionMode
    primary_capabilities: List[str] = Field(default_factory=list)
    related_capabilities: List[str] = Field(default_factory=list)
    artifact_types: List[str] = Field(default_factory=list)
    session_output_type: Optional[str] = None
    requires_source_artifact: bool = False
    supports_chat_refine: bool = False
    supports_selection_context: bool = False
    artifact_surface_type: Optional[ArtifactSurfaceType] = None
    capability_engine: Optional[CapabilityEngine] = None
    execution_carrier: Optional[ExecutionCarrier] = None
    render_contract: Optional[str] = None
    placement_supported: bool = False
    runtime_preview_mode: Optional[str] = None
    cloud_render_mode: Optional[str] = None
    supported_refine_modes: List[RefineMode] = Field(default_factory=list)
    supported_selection_scopes: List[SelectionScope] = Field(default_factory=list)
    source_binding_mode: SourceBindingMode = SourceBindingMode.NONE
    config_fields: List[StudioCardConfigField] = Field(default_factory=list)
    actions: List[StudioCardAction] = Field(default_factory=list)
    notes: Optional[str] = None


class StudioCardExecutionPlan(BaseModel):
    card_id: str
    readiness: StudioCardReadiness
    execution_carrier: Optional[ExecutionCarrier] = None
    supported_refine_modes: List[RefineMode] = Field(default_factory=list)
    supported_selection_scopes: List[SelectionScope] = Field(default_factory=list)
    initial_binding: StudioCardExecutionBinding
    refine_binding: Optional[StudioCardExecutionBinding] = None
    follow_up_turn_binding: Optional[StudioCardExecutionBinding] = None
    source_binding: Optional[StudioCardExecutionBinding] = None
    placement_binding: Optional[StudioCardExecutionBinding] = None


class StudioCardExecutionPreviewRequest(BaseModel):
    project_id: str
    config: dict = Field(default_factory=dict)
    template_config: Optional[dict] = None
    visibility: Optional[str] = None
    primary_source_id: Optional[str] = None
    selected_source_ids: Optional[List[str]] = None
    source_artifact_id: Optional[str] = None
    selected_file_ids: Optional[List[str]] = None
    rag_source_ids: Optional[List[str]] = None
    selected_library_ids: Optional[List[str]] = None
    client_session_id: Optional[str] = None
    run_id: Optional[str] = None


class StudioCardResolvedRequest(BaseModel):
    method: str
    endpoint: str
    payload: dict = Field(default_factory=dict)
    refine_mode: Optional[RefineMode] = None
    notes: Optional[str] = None


class StudioCardExecutionPreview(BaseModel):
    card_id: str
    readiness: StudioCardReadiness
    execution_carrier: Optional[ExecutionCarrier] = None
    initial_request: StudioCardResolvedRequest
    refine_request: Optional[StudioCardResolvedRequest] = None
    source_request: Optional[StudioCardResolvedRequest] = None
    placement_request: Optional[StudioCardResolvedRequest] = None
    render_mode: Optional[str] = None
    artifact_type: Optional[str] = None
    placement_supported: bool = False
    runtime_preview_mode: Optional[str] = None
    cloud_render_mode: Optional[str] = None
    cloud_video_status: Optional[str] = None
    protocol_status: Optional[str] = None
    spec_preview: Optional[dict] = None


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
    execution_carrier: Optional[ExecutionCarrier] = None
    latest_runnable_state: Optional[dict] = None
    provenance: Optional[dict] = None
    source_binding: Optional[dict] = None
    selection_anchor_schema_version: Optional[str] = None


class StudioCardExecutionResponse(BaseModel):
    success: bool = True
    data: dict
    message: str = "Studio 卡片执行成功"


class StudioCardRefineRequest(BaseModel):
    project_id: str
    message: str = ""
    artifact_id: Optional[str] = None
    session_id: Optional[str] = None
    refine_mode: RefineMode = RefineMode.CHAT_REFINE
    selection_anchor: Optional[dict] = None
    config: dict = Field(default_factory=dict)
    visibility: Optional[str] = None
    primary_source_id: Optional[str] = None
    selected_source_ids: Optional[List[str]] = None
    source_artifact_id: Optional[str] = None
    selected_file_ids: Optional[List[str]] = None
    rag_source_ids: Optional[List[str]] = None
    selected_library_ids: Optional[List[str]] = None


class StudioCardTurnRequest(BaseModel):
    project_id: str
    artifact_id: str
    session_id: Optional[str] = None
    teacher_answer: str
    config: dict = Field(default_factory=dict)
    selected_file_ids: Optional[List[str]] = None
    rag_source_ids: Optional[List[str]] = None
    selected_library_ids: Optional[List[str]] = None
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


class StudioCardSourceBindingCandidate(BaseModel):
    required: bool = False
    mode: SourceBindingMode = SourceBindingMode.NONE
    accepted_types: List[str] = Field(default_factory=list)
    selected_ids: List[str] = Field(default_factory=list)
    visibility_scope: Optional[str] = None
    status: Optional[str] = None
    sources: List[StudioCardSourceArtifact] = Field(default_factory=list)


class StudioCardSourceOptionsResponse(BaseModel):
    success: bool = True
    data: dict
    message: str = "Studio 卡片源成果获取成功"
