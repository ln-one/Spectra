from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from typing import Awaitable, Callable, Optional

from services.ai import ai_service
from services.generation_session_service.constants import (
    OutlineGenerationErrorCode,
    OutlineGenerationStateReason,
)
from services.generation_session_service.outline_draft.runtime_helpers import (
    generate_outline_doc,
)
from services.generation_session_service.outline_draft.state_helpers import (
    emit_outline_failure,
    emit_outline_failure_state,
    emit_outline_success,
    is_concurrently_completed,
    persist_outline_failure_fallback,
    persist_outline_success,
)
from services.generation_session_service.outline_versions import (
    load_latest_outline_record,
)
from services.generation_session_service.run_queries import resolve_output_tool_type
from services.generation_session_service.session_history import (
    RUN_STATUS_PENDING,
    RUN_STATUS_PROCESSING,
    RUN_STEP_CONFIG,
    RUN_STEP_OUTLINE,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState
from services.prompt_service import build_prompt_traceability

logger = logging.getLogger(__name__)

_generate_outline_doc = generate_outline_doc


def _iter_outline_sections(outline_doc: dict) -> list[dict]:
    nodes = outline_doc.get("nodes")
    if not isinstance(nodes, list):
        return []
    sections: list[dict] = []
    for index, node in enumerate(nodes, start=1):
        if not isinstance(node, dict):
            continue
        sections.append(
            {
                "section_index": index,
                "section_title": str(node.get("title") or "").strip(),
                "section_payload": node,
            }
        )
    return sections


def _outline_draft_timeout_seconds() -> float:
    raw = os.getenv("OUTLINE_DRAFT_TIMEOUT_SECONDS")
    if raw is None or not str(raw).strip():
        raw = os.getenv("AI_REQUEST_TIMEOUT_SECONDS", "90")
    raw = str(raw).strip()
    try:
        parsed = float(raw)
        return parsed if parsed > 0 else 90.0
    except ValueError:
        return 90.0


def _classify_outline_failure(exc: Exception) -> tuple[str, str, str]:
    if isinstance(exc, TimeoutError):
        return (
            OutlineGenerationErrorCode.TIMEOUT.value,
            "大纲生成超时，请稍后重试。",
            OutlineGenerationStateReason.TIMED_OUT.value,
        )
    return (
        OutlineGenerationErrorCode.FAILED.value,
        "大纲生成失败，请稍后重试。",
        OutlineGenerationStateReason.FAILED.value,
    )


async def _resolve_outline_run_id(
    *,
    db,
    session_id: str,
    output_type: Optional[str],
) -> Optional[str]:
    run_model = getattr(db, "sessionrun", None)
    if run_model is None or not hasattr(run_model, "find_first"):
        return None

    tool_type = resolve_output_tool_type(str(output_type or "").strip().lower())
    active_outline_run = await run_model.find_first(
        where={
            "sessionId": session_id,
            "toolType": tool_type,
            "step": RUN_STEP_OUTLINE,
            "status": {"in": [RUN_STATUS_PENDING, RUN_STATUS_PROCESSING]},
        },
        order={"updatedAt": "desc"},
    )
    if active_outline_run:
        return getattr(active_outline_run, "id", None)

    fallback_run = await run_model.find_first(
        where={
            "sessionId": session_id,
            "step": RUN_STEP_OUTLINE,
            "status": {"in": [RUN_STATUS_PENDING, RUN_STATUS_PROCESSING]},
        },
        order={"updatedAt": "desc"},
    )
    if fallback_run:
        return getattr(fallback_run, "id", None)

    studio_card_run = await run_model.find_first(
        where={
            "sessionId": session_id,
            "toolType": {"startsWith": "studio_card:"},
            "step": {"in": [RUN_STEP_CONFIG, RUN_STEP_OUTLINE]},
            "status": {"in": [RUN_STATUS_PENDING, RUN_STATUS_PROCESSING]},
        },
        order={"updatedAt": "desc"},
    )
    return getattr(studio_card_run, "id", None) if studio_card_run else None


async def execute_outline_draft_local(
    *,
    db,
    session_id: str,
    project_id: str,
    options: Optional[dict],
    append_event: Callable[..., Awaitable[None]],
    ai_service_obj=ai_service,
    trace_id: Optional[str] = None,
) -> None:
    trace_id = trace_id or str(uuid.uuid4())
    next_outline_version = 1
    stage_timings_ms: dict[str, float] = {}
    run_id: Optional[str] = None
    output_type: Optional[str] = None
    traceability_payload = build_prompt_traceability(
        rag_source_ids=(options or {}).get("rag_source_ids")
    )
    try:
        session = await db.generationsession.find_unique(where={"id": session_id})
        if not session:
            logger.warning(
                "Outline draft skipped because session not found: session=%s",
                session_id,
            )
            return

        state = session.get("state") if isinstance(session, dict) else session.state
        current_outline_version = (
            session.get("currentOutlineVersion")
            if isinstance(session, dict)
            else session.currentOutlineVersion
        )
        output_type = (
            session.get("outputType")
            if isinstance(session, dict)
            else getattr(session, "outputType", None)
        )
        if state != GenerationState.DRAFTING_OUTLINE.value:
            logger.info(
                "Outline draft skipped due to non-drafting session state: "
                "session=%s state=%s current_outline_version=%s",
                session_id,
                state,
                current_outline_version,
            )
            return
        latest_outline_record = await load_latest_outline_record(db, session_id)
        latest_outline_version = (
            max(
                int(
                    (
                        latest_outline_record.get("version")
                        if isinstance(latest_outline_record, dict)
                        else getattr(latest_outline_record, "version", 0)
                    )
                    or 0
                ),
                0,
            )
            if latest_outline_record is not None
            else 0
        )
        next_outline_version = (
            max(int(current_outline_version or 0), latest_outline_version, 0) + 1
        )
        run_id = await _resolve_outline_run_id(
            db=db,
            session_id=session_id,
            output_type=output_type,
        )
        await append_event(
            session_id=session_id,
            event_type=GenerationEventType.OUTLINE_STARTED.value,
            state=GenerationState.DRAFTING_OUTLINE.value,
            payload={"stage": "outline_draft", "trace_id": trace_id, "run_id": run_id},
        )

        await _emit_outline_progress(
            append_event,
            session_id,
            trace_id,
            run_id=run_id,
            traceability_payload=traceability_payload,
        )
        outline_started_at = time.perf_counter()
        outline_doc = await asyncio.wait_for(
            generate_outline_doc(
                db=db,
                session_id=session_id,
                project_id=project_id,
                options=options,
                ai_service_obj=ai_service_obj,
            ),
            timeout=_outline_draft_timeout_seconds(),
        )
        stage_timings_ms["outline_total_ms"] = round(
            (time.perf_counter() - outline_started_at) * 1000,
            2,
        )
        stage_timings_ms["requirements_build_ms"] = round(
            float(outline_doc.pop("_requirements_build_ms", 0.0)),
            2,
        )
        stage_timings_ms["rag_context_ms"] = round(
            float(outline_doc.pop("_rag_context_ms", 0.0)),
            2,
        )
        stage_timings_ms["outline_llm_ms"] = round(
            float(outline_doc.pop("_outline_llm_ms", 0.0)),
            2,
        )
        for section in _iter_outline_sections(outline_doc):
            await append_event(
                session_id=session_id,
                event_type=GenerationEventType.OUTLINE_SECTION_GENERATED.value,
                state=GenerationState.DRAFTING_OUTLINE.value,
                payload={
                    "trace_id": trace_id,
                    "run_id": run_id,
                    **section,
                },
            )
        persist_started_at = time.perf_counter()
        await persist_outline_success(
            db=db,
            session_id=session_id,
            outline_doc=outline_doc,
            outline_version=next_outline_version,
        )
        stage_timings_ms["persist_outline_ms"] = round(
            (time.perf_counter() - persist_started_at) * 1000,
            2,
        )
        if run_id is None:
            run_id = await _resolve_outline_run_id(
                db=db,
                session_id=session_id,
                output_type=output_type,
            )
        await emit_outline_success(
            append_event,
            session_id=session_id,
            trace_id=trace_id,
            outline_version=next_outline_version,
            stage_timings_ms=stage_timings_ms,
            run_id=run_id,
            traceability_payload=traceability_payload,
        )
        logger.info(
            "outline_draft_stage_timing",
            extra={
                "session_id": session_id,
                "trace_id": trace_id,
                "stage_timings_ms": stage_timings_ms,
            },
        )
    except Exception as draft_err:
        if await is_concurrently_completed(db, session_id, trace_id):
            return

        error_code, error_message, failure_state_reason = _classify_outline_failure(
            draft_err
        )

        logger.error(
            "Outline draft failed: session=%s trace_id=%s error_code=%s error=%s",
            session_id,
            trace_id,
            error_code,
            draft_err,
            exc_info=True,
        )
        if run_id is None:
            run_id = await _resolve_outline_run_id(
                db=db,
                session_id=session_id,
                output_type=output_type,
            )
        await emit_outline_failure(
            append_event,
            session_id=session_id,
            error_code=error_code,
            error_message=error_message,
            trace_id=trace_id,
            run_id=run_id,
            traceability_payload=traceability_payload,
        )
        await persist_outline_failure_fallback(
            db=db,
            session_id=session_id,
            error_code=error_code,
            error_message=error_message,
            failure_state_reason=failure_state_reason,
        )
        await emit_outline_failure_state(
            append_event,
            session_id=session_id,
            trace_id=trace_id,
            failure_state_reason=failure_state_reason,
            run_id=run_id,
            traceability_payload=traceability_payload,
        )


async def _emit_outline_progress(
    append_event,
    session_id: str,
    trace_id: str,
    run_id: Optional[str] = None,
    traceability_payload: Optional[dict] = None,
) -> None:
    await append_event(
        session_id=session_id,
        event_type=GenerationEventType.PROGRESS_UPDATED.value,
        state=GenerationState.DRAFTING_OUTLINE.value,
        progress=15,
        payload={
            "stage": "outline_draft",
            "trace_id": trace_id,
            "run_id": run_id,
            **(traceability_payload or {}),
        },
    )
