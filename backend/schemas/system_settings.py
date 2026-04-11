from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field


class SystemSettingsModels(BaseModel):
    default_model: str
    large_model: str
    small_model: str


class SystemSettingsGenerationDefaults(BaseModel):
    default_output_type: Literal["ppt", "word", "both"] = "ppt"
    default_page_count: int = Field(default=12, ge=1, le=100)
    default_outline_style: str = "structured"


class SystemSettingsFeatureFlags(BaseModel):
    enable_ai_generation: bool = True
    enable_file_upload: bool = True
    feature_flags: Dict[str, Any] = Field(default_factory=dict)


class SystemSettingsExperience(BaseModel):
    chat_timeout_seconds: int = Field(default=300, ge=1)
    ai_request_timeout_seconds: int = Field(default=60, ge=1)


class SystemSettingsData(BaseModel):
    models: SystemSettingsModels
    generation_defaults: SystemSettingsGenerationDefaults
    feature_flags: SystemSettingsFeatureFlags
    experience: SystemSettingsExperience


class SystemSettingsModelsUpdate(BaseModel):
    default_model: Optional[str] = None
    large_model: Optional[str] = None
    small_model: Optional[str] = None


class SystemSettingsGenerationDefaultsUpdate(BaseModel):
    default_output_type: Optional[Literal["ppt", "word", "both"]] = None
    default_page_count: Optional[int] = Field(default=None, ge=1, le=100)
    default_outline_style: Optional[str] = None


class SystemSettingsFeatureFlagsUpdate(BaseModel):
    enable_ai_generation: Optional[bool] = None
    enable_file_upload: Optional[bool] = None
    feature_flags: Optional[Dict[str, Any]] = None


class SystemSettingsExperienceUpdate(BaseModel):
    chat_timeout_seconds: Optional[int] = Field(default=None, ge=1)
    ai_request_timeout_seconds: Optional[int] = Field(default=None, ge=1)


GenerationDefaultsUpdateField = Optional[SystemSettingsGenerationDefaultsUpdate]


class SystemSettingsUpdateRequest(BaseModel):
    models: Optional[SystemSettingsModelsUpdate] = None
    generation_defaults: GenerationDefaultsUpdateField = None
    feature_flags: Optional[SystemSettingsFeatureFlagsUpdate] = None
    experience: Optional[SystemSettingsExperienceUpdate] = None
