from __future__ import annotations

import asyncio
import logging
from typing import Optional

from services.diego_client import build_diego_client
from services.generation_session_service.constants import (
    OutlineChangeReason,
    OutlineGenerationStateReason,
    SessionLifecycleReason,
)
from services.generation_session_service.event_store import append_event
from services.generation_session_service.outline_versions import (
    persist_outline_version,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState
from services.task_executor.constants import TaskFailureStateReason

from .diego_runtime_artifacts import persist_diego_success_artifact
from .diego_runtime_helpers import (
    convert_diego_outline_to_spectra,
    parse_options,
)
from .diego_runtime_state import mark_diego_failed, set_session_state

logger = logging.getLogger(__name__)

_SCHEMA_VERSION = 1
_DIEGO_STATUS_OUTLINE_DRAFTING = "OUTLINE_DRAFTING"
_DIEGO_STATUS_AWAITING_OUTLINE_CONFIRM = "AWAITING_OUTLINE_CONFIRM"
_DIEGO_STATUS_SLIDES_GENERATING = "SLIDES_GENERATING"
_DIEGO_STATUS_COMPILING = "COMPILING"
_DIEGO_STATUS_SUCCEEDED = "SUCCEEDED"
_DIEGO_STATUS_FAILED = "FAILED"


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
    client = build_diego_client()
    if client is None:
        return

    try:
        deadline = asyncio.get_running_loop().time() + timeout_seconds
        while asyncio.get_running_loop().time() < deadline:
            detail = await client.get_run(diego_run_id)
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
                await persist_outline_version(
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
                await append_event(
                    db=db,
                    schema_version=_SCHEMA_VERSION,
                    session_id=session_id,
                    event_type=GenerationEventType.OUTLINE_COMPLETED.value,
                    state=GenerationState.AWAITING_OUTLINE_CONFIRM.value,
                    progress=100,
                    payload=payload,
                )
                await append_event(
                    db=db,
                    schema_version=_SCHEMA_VERSION,
                    session_id=session_id,
                    event_type=GenerationEventType.OUTLINE_UPDATED.value,
                    state=GenerationState.AWAITING_OUTLINE_CONFIRM.value,
                    progress=100,
                    payload=payload,
                )
                await set_session_state(
                    db=db,
                    session_id=session_id,
                    state=GenerationState.AWAITING_OUTLINE_CONFIRM.value,
                    state_reason=OutlineGenerationStateReason.DRAFTED_ASYNC.value,
                    progress=100,
                    payload=payload,
                )
                return

            if status == _DIEGO_STATUS_FAILED:
                await mark_diego_failed(
                    db=db,
                    session_id=session_id,
                    run_id=spectra_run_id,
                    diego_run_id=diego_run_id,
                    error_code=str(detail.get("error_code") or "DIEGO_OUTLINE_FAILED"),
                    error_message=str(
                        (detail.get("error_details") or {}).get("message")
                        or "Diego outline drafting failed"
                    ),
                    retryable=bool(detail.get("retryable")),
                )
                return

            await asyncio.sleep(poll_interval_seconds)

        await mark_diego_failed(
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
        await mark_diego_failed(
            db=db,
            session_id=session_id,
            run_id=spectra_run_id,
            diego_run_id=diego_run_id,
            error_code="DIEGO_OUTLINE_SYNC_FAILED",
            error_message=str(exc),
            retryable=True,
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
    client = build_diego_client()
    if client is None:
        return

    try:
        deadline = asyncio.get_running_loop().time() + timeout_seconds
        last_status: str | None = None
        while asyncio.get_running_loop().time() < deadline:
            detail = await client.get_run(diego_run_id)
            status = str(detail.get("status") or "").strip().upper()
            if status != last_status:
                if status == _DIEGO_STATUS_SLIDES_GENERATING:
                    await set_session_state(
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
                    await set_session_state(
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
                session = await db.generationsession.find_unique(where={"id": session_id})
                if not session:
                    return
                options = parse_options(getattr(session, "options", None))
                pptx_bytes = await client.download_pptx(diego_run_id)
                artifact_id, output_url = await persist_diego_success_artifact(
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
                await append_event(
                    db=db,
                    schema_version=_SCHEMA_VERSION,
                    session_id=session_id,
                    event_type=GenerationEventType.GENERATION_COMPLETED.value,
                    state=GenerationState.SUCCESS.value,
                    progress=100,
                    payload=payload,
                )
                await set_session_state(
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
                await mark_diego_failed(
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

        await mark_diego_failed(
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
        await mark_diego_failed(
            db=db,
            session_id=session_id,
            run_id=getattr(run, "id", None),
            diego_run_id=diego_run_id,
            error_code="DIEGO_GENERATION_SYNC_FAILED",
            error_message=str(exc),
            retryable=True,
        )
