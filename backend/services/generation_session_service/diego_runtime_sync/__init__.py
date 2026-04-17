"""Diego runtime sync package with legacy-compatible exports."""

import asyncio

from .dependencies import (
    append_event,
    build_diego_client,
    load_preview_content,
    mark_diego_failed,
    persist_diego_success_artifact,
    persist_outline_version,
    save_preview_content,
    set_session_state,
)
from .events import _extract_diego_events, _extract_new_slide_numbers
from .generation_sync import sync_diego_generation_until_terminal
from .outline_sync import sync_diego_outline_until_ready
from .pending_slides import _sync_pending_slide_previews
from .preview_payload import (
    _build_spectra_preview_page,
    _load_or_init_run_preview_payload,
    _upsert_rendered_preview_page,
)
from .stream import _append_diego_stream_events

__all__ = [
    "append_event",
    "asyncio",
    "build_diego_client",
    "load_preview_content",
    "mark_diego_failed",
    "persist_diego_success_artifact",
    "persist_outline_version",
    "save_preview_content",
    "set_session_state",
    "sync_diego_generation_until_terminal",
    "sync_diego_outline_until_ready",
]
