"""Single-slide Diego regeneration preview sync."""

from __future__ import annotations

import asyncio
from typing import Optional

from services.generation_session_service.run_lifecycle import update_session_run

from .constants import (
    _DIEGO_EVENT_SLIDE_GENERATED,
    _DIEGO_STATUS_FAILED,
    _DIEGO_STATUS_SUCCEEDED,
    logger,
)
from .dependencies import active
from .events import _extract_diego_events
from .pending_slides import _sync_pending_slide_previews


async def sync_diego_regenerated_slide_until_ready(
    *,
    db,
    session_id: str,
    run,
    diego_run_id: str,
    diego_trace_id: Optional[str],
    slide_no: int,
    baseline_seq: int,
    poll_interval_seconds: float,
    timeout_seconds: float,
) -> None:
    client = active("build_diego_client")()
    if client is None:
        return

    preview_payload: dict | None = None
    try:
        deadline = asyncio.get_running_loop().time() + timeout_seconds
        while asyncio.get_running_loop().time() < deadline:
            detail = await client.get_run(diego_run_id)
            status = str(detail.get("status") or "").strip().upper()
            diego_events = _extract_diego_events(detail)
            target_event_seen = any(
                int(item.get("seq") or 0) > baseline_seq
                and str(item.get("event") or "").strip() == _DIEGO_EVENT_SLIDE_GENERATED
                and int(((item.get("payload") or {}) if isinstance(item.get("payload"), dict) else {}).get("slide_no") or 0) == slide_no
                for item in diego_events
            )

            if target_event_seen or status in {_DIEGO_STATUS_SUCCEEDED, _DIEGO_STATUS_FAILED}:
                pending, preview_payload = await _sync_pending_slide_previews(
                    db=db,
                    session_id=session_id,
                    run=run,
                    client=client,
                    diego_run_id=diego_run_id,
                    diego_trace_id=diego_trace_id,
                    diego_status=status,
                    pending_slide_numbers={slide_no},
                    preview_payload=preview_payload,
                )
                if not pending:
                    return
                if status == _DIEGO_STATUS_FAILED:
                    break

            await asyncio.sleep(max(0.2, poll_interval_seconds))
    except Exception as exc:
        logger.warning(
            (
                "Diego regenerate sync failed: session=%s run=%s diego_run=%s "
                "slide_no=%s error=%s"
            ),
            session_id,
            getattr(run, "id", None),
            diego_run_id,
            slide_no,
            exc,
            exc_info=True,
        )
    finally:
        await update_session_run(
            db=db,
            run_id=getattr(run, "id", ""),
            status="completed",
            step="completed",
        )
