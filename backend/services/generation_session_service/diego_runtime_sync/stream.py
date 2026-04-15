"""Diego stream event append helpers."""

from __future__ import annotations

from typing import Optional

from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState

from .constants import _SCHEMA_VERSION
from .dependencies import active
from .events import _build_progress_message, _resolve_stream_channel


async def _append_diego_stream_events(
    *,
    db,
    session_id: str,
    spectra_run_id: str,
    diego_run_id: str,
    diego_trace_id: Optional[str],
    diego_events: list[dict[str, object]],
    last_seq: int,
) -> int:
    next_seq = last_seq
    for item in diego_events:
        seq = int(item.get("seq") or 0)
        if seq <= next_seq:
            continue
        event_type = str(item.get("event") or "").strip()
        payload = item.get("payload") if isinstance(item.get("payload"), dict) else {}
        stream_channel = _resolve_stream_channel(event_type)
        progress_message = _build_progress_message(event_type, payload)
        event_payload = {
            "run_id": spectra_run_id,
            "tool_type": "courseware_ppt",
            "progress_message": progress_message,
            "section_payload": {
                "stream_channel": stream_channel,
                "diego_event_type": event_type,
                "diego_seq": seq,
                "token": str(payload.get("token") or ""),
                "raw_payload": payload,
            },
            "diego_run_id": diego_run_id,
            "diego_trace_id": diego_trace_id,
        }
        await active("append_event")(
            db=db,
            schema_version=_SCHEMA_VERSION,
            session_id=session_id,
            event_type=GenerationEventType.PROGRESS_UPDATED.value,
            state=GenerationState.DRAFTING_OUTLINE.value,
            progress=None,
            payload=event_payload,
        )
        next_seq = seq
    return next_seq
