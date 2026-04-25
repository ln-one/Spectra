"""Diego generation polling and terminal artifact sync."""

from __future__ import annotations

import asyncio
from typing import Optional

from services.generation_session_service.run_constants import (
    RUN_STATUS_COMPLETED,
    RUN_STEP_COMPLETED,
)
from services.generation_session_service.run_lifecycle import update_session_run
from services.generation_session_service.constants import SessionLifecycleReason
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState
from services.task_executor.constants import TaskFailureStateReason
from utils.exceptions import ExternalServiceException

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
    _extract_new_slide_payloads,
    _extract_new_slide_numbers,
    _extract_slide_numbers_from_run_detail,
)
from .pending_slides import _sync_pending_slide_previews

_FINAL_PREVIEW_REFRESH_ATTEMPTS = 3


def _has_diego_pptx_hint(detail: dict[str, object]) -> bool:
    if bool(detail.get("pptx_ready")):
        return True
    pptx_path = str(detail.get("pptx_path") or "").strip()
    if pptx_path:
        return True
    artifacts = detail.get("artifacts")
    if isinstance(artifacts, dict):
        pptx = artifacts.get("pptx")
        if isinstance(pptx, dict):
            if bool(pptx.get("downloadable")):
                return True
            if str(pptx.get("path") or "").strip():
                return True
    return False


async def _try_download_ready_pptx(
    *,
    client,
    diego_run_id: str,
    detail: dict[str, object],
) -> bytes | None:
    status = str(detail.get("status") or "").strip().upper()
    error_code = str(detail.get("error_code") or "").strip().upper()
    should_probe = (
        _has_diego_pptx_hint(detail)
        or status
        in {
            _DIEGO_STATUS_COMPILING,
            _DIEGO_STATUS_SUCCEEDED,
        }
        or (status == _DIEGO_STATUS_FAILED and error_code == "FINALIZE_TIMEOUT")
    )
    if not should_probe:
        return None
    try:
        return await client.download_pptx(diego_run_id)
    except ExternalServiceException as exc:
        details = exc.details if isinstance(exc.details, dict) else {}
        try:
            status_code = int(details.get("status_code") or 0)
        except (TypeError, ValueError):
            status_code = 0
        if status_code in {404, 409}:
            return None
        raise


async def _persist_success_and_finalize(
    *,
    db,
    session_id: str,
    run,
    diego_run_id: str,
    diego_trace_id: Optional[str],
    pptx_bytes: bytes,
) -> None:
    session = await db.generationsession.find_unique(where={"id": session_id})
    if not session:
        return
    options = parse_options(getattr(session, "options", None))
    artifact_id, output_url = await active("persist_diego_success_artifact")(
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
    await update_session_run(
        db=db,
        run_id=run.id,
        status=RUN_STATUS_COMPLETED,
        step=RUN_STEP_COMPLETED,
        artifact_id=artifact_id,
    )
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
        pending_slide_payloads: dict[int, dict[str, object]] = {}
        preview_payload: dict | None = None
        while asyncio.get_running_loop().time() < deadline:
            detail = await client.get_run(diego_run_id)
            status = str(detail.get("status") or "").strip().upper()
            diego_events = _extract_diego_events(detail)
            if diego_events:
                previous_seq = last_diego_event_seq
                (
                    last_diego_event_seq,
                    newly_generated_slides,
                ) = _extract_new_slide_numbers(
                    diego_events=diego_events,
                    last_seq=previous_seq,
                )
                if newly_generated_slides:
                    pending_slide_numbers.update(newly_generated_slides)
                (
                    _,
                    newly_generated_payloads,
                ) = _extract_new_slide_payloads(
                    diego_events=diego_events,
                    last_seq=previous_seq,
                )
                if newly_generated_payloads:
                    pending_slide_payloads.update(newly_generated_payloads)

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
                        preview_by_slide_no=pending_slide_payloads,
                        diego_render_version=detail.get("render_version"),
                    )
                )
                for slide_no in list(pending_slide_payloads):
                    if slide_no not in pending_slide_numbers:
                        pending_slide_payloads.pop(slide_no, None)

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

            pptx_bytes = await _try_download_ready_pptx(
                client=client,
                diego_run_id=diego_run_id,
                detail=detail,
            )
            if pptx_bytes is not None:
                pending_slide_numbers.update(
                    _extract_slide_numbers_from_run_detail(detail)
                )
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
                            preview_by_slide_no=pending_slide_payloads,
                            diego_render_version=detail.get("render_version"),
                        )
                    )
                    for slide_no in list(pending_slide_payloads):
                        if slide_no not in pending_slide_numbers:
                            pending_slide_payloads.pop(slide_no, None)
                    if (
                        pending_slide_numbers
                        and attempt + 1 < _FINAL_PREVIEW_REFRESH_ATTEMPTS
                    ):
                        await asyncio.sleep(min(max(poll_interval_seconds, 0.2), 1.0))
                await _persist_success_and_finalize(
                    db=db,
                    session_id=session_id,
                    run=run,
                    diego_run_id=diego_run_id,
                    diego_trace_id=diego_trace_id,
                    pptx_bytes=pptx_bytes,
                )
                return

            if status == _DIEGO_STATUS_FAILED:
                error_code = str(detail.get("error_code") or "").strip().upper()
                if error_code == "FINALIZE_TIMEOUT":
                    fallback_pptx = await _try_download_ready_pptx(
                        client=client,
                        diego_run_id=diego_run_id,
                        detail=detail,
                    )
                    if fallback_pptx is not None:
                        await _persist_success_and_finalize(
                            db=db,
                            session_id=session_id,
                            run=run,
                            diego_run_id=diego_run_id,
                            diego_trace_id=diego_trace_id,
                            pptx_bytes=fallback_pptx,
                        )
                        return
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
