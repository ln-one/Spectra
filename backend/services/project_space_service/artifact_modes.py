"""Artifact mode and replacement helpers for the Spectra-side Ourograph facade."""

from __future__ import annotations

import json
import logging
from enum import Enum
from typing import Any, Optional

from utils.exceptions import ValidationException

logger = logging.getLogger(__name__)

SUPPORTED_ARTIFACT_MODES = {"create", "replace"}


def normalize_artifact_mode(mode: Optional[str]) -> str:
    raw_mode = mode.value if isinstance(mode, Enum) else mode
    normalized = str(raw_mode or "create").strip().lower()
    if normalized not in SUPPORTED_ARTIFACT_MODES:
        raise ValidationException(
            f"Unsupported artifact mode '{normalized}'. "
            f"Supported modes: {', '.join(sorted(SUPPORTED_ARTIFACT_MODES))}"
        )
    return normalized


def parse_artifact_metadata(raw_metadata: Any) -> dict[str, Any]:
    if isinstance(raw_metadata, dict):
        return dict(raw_metadata)
    if isinstance(raw_metadata, str) and raw_metadata.strip():
        try:
            parsed = json.loads(raw_metadata)
        except json.JSONDecodeError:
            logger.warning("artifact metadata is not valid JSON during replace flow")
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def is_current_artifact(artifact: Any) -> bool:
    metadata = parse_artifact_metadata(getattr(artifact, "metadata", None))
    return bool(metadata.get("is_current", True))


def select_replaced_artifact(
    candidates: list[Any], *, based_on_version_id: Optional[str]
):
    if not candidates:
        return None
    if based_on_version_id:
        matched = [
            artifact
            for artifact in candidates
            if getattr(artifact, "basedOnVersionId", None) == based_on_version_id
        ]
        current_matched = [
            artifact for artifact in matched if is_current_artifact(artifact)
        ]
        if current_matched:
            return current_matched[0]
        if matched:
            return matched[0]
    current_candidates = [
        artifact for artifact in candidates if is_current_artifact(artifact)
    ]
    if current_candidates:
        return current_candidates[0]
    return candidates[0]
