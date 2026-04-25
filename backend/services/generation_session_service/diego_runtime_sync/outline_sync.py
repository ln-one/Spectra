"""Diego outline polling and terminal state sync."""

from __future__ import annotations

import asyncio
from typing import Optional

from services.generation_session_service.constants import (
    OutlineChangeReason,
    OutlineGenerationStateReason,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState

from ..diego_runtime_helpers import convert_diego_outline_to_spectra
from .constants import (
    _DIEGO_STATUS_AWAITING_OUTLINE_CONFIRM,
    _DIEGO_STATUS_FAILED,
    _DIEGO_STATUS_OUTLINE_DRAFTING,
    _SCHEMA_VERSION,
    logger,
)
from .dependencies import active
from .events import _extract_diego_events
from .stream import _append_diego_stream_events


async def sync_diego_outline_until_ready(
    *,
    db,
    session_id: str,
    spectra_run_id: str,
    diego_run_id: str,
    diego_trace_id: Optional[str],
    poll_interval_seconds: float,
    timeout_seconds: float,
) -> None:
    client = active("build_diego_client")()
    if client is None:
        return

    try:
        deadline = asyncio.get_running_loop().time() + timeout_seconds
        last_diego_event_seq = 0
        while asyncio.get_running_loop().time() < deadline:
            detail = await client.get_run(diego_run_id)
            diego_events = _extract_diego_events(detail)
            if diego_events:
                last_diego_event_seq = await _append_diego_stream_events(
                    db=db,
                    session_id=session_id,
                    spectra_run_id=spectra_run_id,
                    diego_run_id=diego_run_id,
                    diego_trace_id=diego_trace_id,
                    diego_events=diego_events,
                    last_seq=last_diego_event_seq,
                )
            status = str(detail.get("status") or "").strip().upper()
            if status == _DIEGO_STATUS_OUTLINE_DRAFTING:
                await asyncio.sleep(poll_interval_seconds)
                continue

            if status == _DIEGO_STATUS_AWAITING_OUTLINE_CONFIRM:
                outline_raw = detail.get("outline")
                outline_doc = (
                    convert_diego_outline_to_spectra(outline_raw)
                    if isinstance(outline_raw, dict)
                    else {"version": 1, "nodes": [], "summary": None}
                )
                outline_version = max(int(outline_doc.get("version") or 1), 1)
                await active("persist_outline_version")(
                    db=db,
                    session_id=session_id,
                    version=outline_version,
                    outline_data=outline_doc,
                    change_reason=OutlineChangeReason.DRAFTED_ASYNC.value,
                )
                payload = {
                    "stage": "diego_outline_ready",
                    "run_id": spectra_run_id,
                    "diego_run_id": diego_run_id,
                    "diego_trace_id": diego_trace_id,
                    "version": outline_version,
                    "change_reason": OutlineChangeReason.DRAFTED_ASYNC.value,
                }
                await active("append_event")(
                    db=db,
                    schema_version=_SCHEMA_VERSION,
                    session_id=session_id,
                    event_type=GenerationEventType.OUTLINE_COMPLETED.value,
                    state=GenerationState.AWAITING_OUTLINE_CONFIRM.value,
                    progress=100,
                    payload=payload,
                )
                await active("append_event")(
                    db=db,
                    schema_version=_SCHEMA_VERSION,
                    session_id=session_id,
                    event_type=GenerationEventType.OUTLINE_UPDATED.value,
                    state=GenerationState.AWAITING_OUTLINE_CONFIRM.value,
                    progress=100,
                    payload=payload,
                )
                await active("set_session_state")(
                    db=db,
                    session_id=session_id,
                    state=GenerationState.AWAITING_OUTLINE_CONFIRM.value,
                    state_reason=OutlineGenerationStateReason.DRAFTED_ASYNC.value,
                    progress=100,
                    payload=payload,
                )
                return

            if status == _DIEGO_STATUS_FAILED:
                error_details_raw = detail.get("error_details")
                error_details = (
                    error_details_raw if isinstance(error_details_raw, dict) else {}
                )
                error_reason = str(
                    error_details.get("reason")
                    or error_details.get("message")
                    or detail.get("error_message")
                    or ""
                ).strip()
                error_message = (
                    f"Diego outline drafting failed: {error_reason}"
                    if error_reason
                    else "Diego outline drafting failed"
                )
                await active("mark_diego_failed")(
                    db=db,
                    session_id=session_id,
                    run_id=spectra_run_id,
                    diego_run_id=diego_run_id,
                    error_code=str(detail.get("error_code") or "DIEGO_OUTLINE_FAILED"),
                    error_message=error_message,
                    retryable=bool(detail.get("retryable")),
                )
                return

            await asyncio.sleep(poll_interval_seconds)

        await active("mark_diego_failed")(
            db=db,
            session_id=session_id,
            run_id=spectra_run_id,
            diego_run_id=diego_run_id,
            error_code="DIEGO_OUTLINE_TIMEOUT",
            error_message="Diego outline drafting timed out",
            retryable=True,
        )
    except Exception as exc:
        logger.warning(
            "Diego outline sync failed: session=%s run=%s diego_run=%s error=%s",
            session_id,
            spectra_run_id,
            diego_run_id,
            exc,
            exc_info=True,
        )
        await active("mark_diego_failed")(
            db=db,
            session_id=session_id,
            run_id=spectra_run_id,
            diego_run_id=diego_run_id,
            error_code="DIEGO_OUTLINE_SYNC_FAILED",
            error_message=str(exc),
            retryable=True,
        )
