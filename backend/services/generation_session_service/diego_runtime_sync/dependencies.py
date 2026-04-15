"""Patch-friendly dependency access for Diego runtime sync."""

from __future__ import annotations

import sys

from services.diego_client import build_diego_client
from services.generation_session_service.event_store import append_event
from services.generation_session_service.outline_versions import persist_outline_version
from services.preview_helpers import load_preview_content, save_preview_content

from ..diego_runtime_artifacts import persist_diego_success_artifact
from ..diego_runtime_state import mark_diego_failed, set_session_state


def active(name: str):
    package = sys.modules.get(__package__)
    if package is not None and hasattr(package, name):
        return getattr(package, name)
    return globals()[name]
