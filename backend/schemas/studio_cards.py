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


class StudioCardCapability(BaseModel):
    id: str
    title: str
    readiness: StudioCardReadiness
    context_mode: StudioCardContextMode
    primary_capabilities: List[str] = Field(default_factory=list)
    related_capabilities: List[str] = Field(default_factory=list)
    artifact_types: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
