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
