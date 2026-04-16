"""Diego generation polling and terminal artifact sync."""

from __future__ import annotations

import asyncio
from typing import Optional

from services.generation_session_service.constants import SessionLifecycleReason
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState
from services.task_executor.constants import TaskFailureStateReason

from ..diego_runtime_helpers import parse_options
from .constants import (
    _DIEGO_STATUS_COMPILING,
    _DIEGO_STATUS_FAILED,
    _DIEGO_STATUS_SLIDES_GENERATING,
    _DIEGO_STATUS_SUCCEEDED,
    _SCHEMA_VERSION,
    logger,
)
from .dependencies import active
from .events import (
    _extract_diego_events,
    _extract_new_slide_numbers,
    _extract_slide_numbers_from_run_detail,
)
from .pending_slides import _sync_pending_slide_previews

_FINAL_PREVIEW_REFRESH_ATTEMPTS = 3


async def sync_diego_generation_until_terminal(
    *,
    db,
    session_id: str,
    run,
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
        last_status: str | None = None
        last_diego_event_seq = 0
        pending_slide_numbers: set[int] = set()
        preview_payload: dict | None = None
        while asyncio.get_running_loop().time() < deadline:
            detail = await client.get_run(diego_run_id)
            status = str(detail.get("status") or "").strip().upper()
            diego_events = _extract_diego_events(detail)
            if diego_events:
                (
                    last_diego_event_seq,
                    newly_generated_slides,
                ) = _extract_new_slide_numbers(
                    diego_events=diego_events,
                    last_seq=last_diego_event_seq,
                )
                if newly_generated_slides:
                    pending_slide_numbers.update(newly_generated_slides)

            if pending_slide_numbers:
                pending_slide_numbers, preview_payload = (
                    await _sync_pending_slide_previews(
                        db=db,
                        session_id=session_id,
                        run=run,
                        client=client,
                        diego_run_id=diego_run_id,
                        diego_trace_id=diego_trace_id,
                        diego_status=status,
                        pending_slide_numbers=pending_slide_numbers,
                        preview_payload=preview_payload,
                    )
                )

            if status != last_status:
                if status == _DIEGO_STATUS_SLIDES_GENERATING:
                    await active("set_session_state")(
                        db=db,
                        session_id=session_id,
                        state=GenerationState.GENERATING_CONTENT.value,
                        state_reason=SessionLifecycleReason.OUTLINE_CONFIRMED.value,
                        progress=60,
                        payload={
                            "stage": "diego_slides_generating",
                            "run_id": run.id,
                            "run_no": run.runNo,
                            "run_title": run.title,
                            "tool_type": run.toolType,
                            "diego_run_id": diego_run_id,
                            "diego_trace_id": diego_trace_id,
                        },
                    )
                elif status == _DIEGO_STATUS_COMPILING:
                    await active("set_session_state")(
                        db=db,
                        session_id=session_id,
                        state=GenerationState.RENDERING.value,
                        state_reason="diego_compiling",
                        progress=85,
                        payload={
                            "stage": "diego_compiling",
                            "run_id": run.id,
                            "run_no": run.runNo,
                            "run_title": run.title,
                            "tool_type": run.toolType,
                            "diego_run_id": diego_run_id,
                            "diego_trace_id": diego_trace_id,
                        },
                    )
                last_status = status

            if status == _DIEGO_STATUS_SUCCEEDED:
                pending_slide_numbers.update(_extract_slide_numbers_from_run_detail(detail))
                for attempt in range(_FINAL_PREVIEW_REFRESH_ATTEMPTS):
                    if not pending_slide_numbers:
                        break
                    pending_slide_numbers, preview_payload = (
                        await _sync_pending_slide_previews(
                            db=db,
                            session_id=session_id,
                            run=run,
                            client=client,
                            diego_run_id=diego_run_id,
                            diego_trace_id=diego_trace_id,
                            diego_status=status,
                            pending_slide_numbers=pending_slide_numbers,
                            preview_payload=preview_payload,
                        )
                    )
                    if pending_slide_numbers and attempt + 1 < _FINAL_PREVIEW_REFRESH_ATTEMPTS:
                        await asyncio.sleep(min(max(poll_interval_seconds, 0.2), 1.0))
                session = await db.generationsession.find_unique(
                    where={"id": session_id}
                )
                if not session:
                    return
                options = parse_options(getattr(session, "options", None))
                pptx_bytes = await client.download_pptx(diego_run_id)
                artifact_id, output_url = await active(
                    "persist_diego_success_artifact"
                )(
                    db=db,
                    session=session,
                    run=run,
                    diego_run_id=diego_run_id,
                    diego_trace_id=diego_trace_id,
                    options=options,
                    pptx_bytes=pptx_bytes,
                )
                payload = {
                    "stage": "diego_completed",
                    "run_id": run.id,
                    "run_no": run.runNo,
                    "run_title": run.title,
                    "tool_type": run.toolType,
                    "run_status": "completed",
                    "run_step": "completed",
                    "diego_run_id": diego_run_id,
                    "diego_trace_id": diego_trace_id,
                    "artifact_id": artifact_id,
                    "output_urls": {"pptx": output_url},
                }
                await active("append_event")(
                    db=db,
                    schema_version=_SCHEMA_VERSION,
                    session_id=session_id,
                    event_type=GenerationEventType.GENERATION_COMPLETED.value,
                    state=GenerationState.SUCCESS.value,
                    progress=100,
                    payload=payload,
                )
                await active("set_session_state")(
                    db=db,
                    session_id=session_id,
                    state=GenerationState.SUCCESS.value,
                    state_reason=TaskFailureStateReason.COMPLETED.value,
                    progress=100,
                    payload=payload,
                    ppt_url=output_url,
                )
                return

            if status == _DIEGO_STATUS_FAILED:
                await active("mark_diego_failed")(
                    db=db,
                    session_id=session_id,
                    run_id=run.id,
                    diego_run_id=diego_run_id,
                    error_code=str(detail.get("error_code") or "DIEGO_RUN_FAILED"),
                    error_message=str(
                        (detail.get("error_details") or {}).get("message")
                        or "Diego run failed"
                    ),
                    retryable=bool(detail.get("retryable")),
                )
                return

            await asyncio.sleep(poll_interval_seconds)

        await active("mark_diego_failed")(
            db=db,
            session_id=session_id,
            run_id=run.id,
            diego_run_id=diego_run_id,
            error_code="DIEGO_GENERATION_TIMEOUT",
            error_message="Diego slide generation timed out",
            retryable=True,
        )
    except Exception as exc:
        logger.warning(
            "Diego generation sync failed: session=%s run=%s diego_run=%s error=%s",
            session_id,
            getattr(run, "id", None),
            diego_run_id,
            exc,
            exc_info=True,
        )
        await active("mark_diego_failed")(
            db=db,
            session_id=session_id,
            run_id=getattr(run, "id", None),
            diego_run_id=diego_run_id,
            error_code="DIEGO_GENERATION_SYNC_FAILED",
            error_message=str(exc),
            retryable=True,
        )
