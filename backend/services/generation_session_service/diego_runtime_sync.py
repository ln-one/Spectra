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
    parse_outline_json,
    persist_outline_version,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState
from services.preview_helpers import load_preview_content, save_preview_content
from services.preview_helpers.content_generation import build_outline_preview_payload
from services.task_executor.constants import TaskFailureStateReason
from utils.exceptions import ExternalServiceException

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
_DIEGO_EVENT_SLIDE_GENERATED = "slide.generated"
_DIEGO_STREAM_CHANNEL_PREAMBLE = "diego.preamble"
_DIEGO_STREAM_CHANNEL_OUTLINE_TOKEN = "diego.outline.token"

_DIEGO_EVENT_MESSAGE_MAP: dict[str, str] = {
    "requirements.analyzing.started": "正在分析需求与素材上下文",
    "requirements.analyzing.completed": "需求分析完成",
    "requirements.analyzed": "需求结构已确定",
    "outline.repair.started": "正在修复大纲结构",
    "outline.repair.completed": "大纲修复完成",
    "outline.repair.failed": "大纲修复失败，正在重试",
    "research.completed": "研究信息已整理",
    "plan.completed": "结构规划完成",
    "outline.completed": "大纲生成完成",
}


def _extract_diego_events(detail: dict[str, object]) -> list[dict[str, object]]:
    raw = detail.get("events")
    if not isinstance(raw, list):
        return []
    events: list[dict[str, object]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        seq_raw = item.get("seq")
        try:
            seq = int(seq_raw)
        except (TypeError, ValueError):
            continue
        event_type = str(item.get("event") or "").strip()
        if seq < 1 or not event_type:
            continue
        payload = item.get("payload")
        events.append(
            {
                "seq": seq,
                "event": event_type,
                "payload": payload if isinstance(payload, dict) else {},
            }
        )
    events.sort(key=lambda entry: int(entry["seq"]))
    return events


def _resolve_stream_channel(event_type: str) -> str:
    if event_type == "outline.token":
        return _DIEGO_STREAM_CHANNEL_OUTLINE_TOKEN
    return _DIEGO_STREAM_CHANNEL_PREAMBLE


def _build_progress_message(event_type: str, payload: dict[str, object]) -> str:
    if event_type == "outline.token":
        token = str(payload.get("token") or "")
        return token
    fallback = _DIEGO_EVENT_MESSAGE_MAP.get(event_type)
    if fallback:
        return fallback
    return event_type


def _extract_new_slide_numbers(
    *,
    diego_events: list[dict[str, object]],
    last_seq: int,
) -> tuple[int, list[int]]:
    next_seq = last_seq
    slide_numbers: list[int] = []
    for item in diego_events:
        seq = int(item.get("seq") or 0)
        if seq <= next_seq:
            continue
        event_type = str(item.get("event") or "").strip()
        if event_type == _DIEGO_EVENT_SLIDE_GENERATED:
            payload = item.get("payload")
            payload_obj = payload if isinstance(payload, dict) else {}
            try:
                slide_no = int(payload_obj.get("slide_no") or 0)
            except (TypeError, ValueError):
                slide_no = 0
            if slide_no >= 1 and slide_no not in slide_numbers:
                slide_numbers.append(slide_no)
        next_seq = seq
    return next_seq, slide_numbers


async def _load_latest_outline_document(db, session_id: str) -> dict | None:
    outline_model = getattr(db, "outlineversion", None)
    if outline_model is None or not hasattr(outline_model, "find_first"):
        return None
    record = await outline_model.find_first(
        where={"sessionId": session_id},
        order={"version": "desc"},
    )
    if not record:
        return None
    parsed = parse_outline_json(getattr(record, "outlineData", None))
    if parsed is not None:
        parsed["version"] = getattr(record, "version", parsed.get("version", 1))
    return parsed


async def _resolve_project_name(db, session_id: str) -> str:
    session_model = getattr(db, "generationsession", None)
    project_model = getattr(db, "project", None)
    if (
        session_model is None
        or not hasattr(session_model, "find_unique")
        or project_model is None
        or not hasattr(project_model, "find_unique")
    ):
        return "课件预览"
    session = await session_model.find_unique(where={"id": session_id})
    if not session:
        return "课件预览"
    project_id = str(getattr(session, "projectId", "") or "").strip()
    if not project_id:
        return "课件预览"
    project = await project_model.find_unique(where={"id": project_id})
    project_name = str(getattr(project, "name", "") or "").strip() if project else ""
    return project_name or "课件预览"


async def _load_or_init_run_preview_payload(
    *,
    db,
    session_id: str,
    spectra_run_id: str,
) -> dict:
    cached = await load_preview_content(spectra_run_id)
    payload = dict(cached) if isinstance(cached, dict) else {}
    if not str(payload.get("title") or "").strip():
        project_name = await _resolve_project_name(db, session_id)
        outline_doc = await _load_latest_outline_document(db, session_id)
        base = (
            build_outline_preview_payload(project_name, outline_doc)
            if isinstance(outline_doc, dict)
            else None
        )
        if isinstance(base, dict):
            payload.update(
                {
                    "title": base.get("title") or project_name,
                    "markdown_content": str(base.get("markdown_content") or ""),
                    "lesson_plan_markdown": str(base.get("lesson_plan_markdown") or ""),
                }
            )
        else:
            payload.setdefault("title", project_name)
            payload.setdefault("markdown_content", "")
            payload.setdefault("lesson_plan_markdown", "")
    payload.setdefault("title", "课件预览")
    payload.setdefault("markdown_content", "")
    payload.setdefault("lesson_plan_markdown", "")

    rendered = payload.get("rendered_preview")
    pages = (
        [dict(item) for item in rendered.get("pages", []) if isinstance(item, dict)]
        if isinstance(rendered, dict)
        else []
    )
    format_name = str((rendered or {}).get("format") or "html").strip() or "html"
    payload["rendered_preview"] = {
        "format": format_name,
        "pages": sorted(
            pages,
            key=lambda item: (
                int(item.get("index") or 0),
                int(item.get("split_index") or 0),
            ),
        ),
        "page_count": len(pages),
    }
    return payload


def _build_spectra_preview_page(
    *,
    spectra_run_id: str,
    slide_no: int,
    preview: dict[str, object],
) -> dict[str, object] | None:
    html_preview = str(preview.get("html_preview") or "")
    if not html_preview.strip():
        return None
    try:
        page_index = int(preview.get("page_index") or (slide_no - 1))
    except (TypeError, ValueError):
        page_index = slide_no - 1
    if page_index < 0:
        page_index = slide_no - 1
    if page_index < 0:
        page_index = 0
    slide_id = (
        str(preview.get("slide_id") or "").strip()
        or f"{spectra_run_id}-slide-{page_index}"
    )
    try:
        split_index = int(preview.get("split_index") or 0)
    except (TypeError, ValueError):
        split_index = 0
    try:
        split_count = int(preview.get("split_count") or 1)
    except (TypeError, ValueError):
        split_count = 1
    page: dict[str, object] = {
        "index": page_index,
        "slide_id": slide_id,
        "html_preview": html_preview,
        "image_url": preview.get("image_url"),
        "status": str(preview.get("status") or "ready"),
        "split_index": split_index,
        "split_count": max(1, split_count),
    }
    width = preview.get("width")
    height = preview.get("height")
    if isinstance(width, int) and width > 0:
        page["width"] = width
    if isinstance(height, int) and height > 0:
        page["height"] = height
    return page


def _upsert_rendered_preview_page(
    preview_payload: dict, page: dict[str, object]
) -> bool:
    rendered = preview_payload.get("rendered_preview")
    if not isinstance(rendered, dict):
        rendered = {"format": "html", "pages": [], "page_count": 0}
        preview_payload["rendered_preview"] = rendered
    pages = rendered.get("pages")
    if not isinstance(pages, list):
        pages = []
        rendered["pages"] = pages

    target_index = int(page.get("index") or 0)
    target_split = int(page.get("split_index") or 0)
    for index, existing in enumerate(pages):
        if not isinstance(existing, dict):
            continue
        if (
            int(existing.get("index") or 0) == target_index
            and int(existing.get("split_index") or 0) == target_split
        ):
            merged = {**existing, **page}
            if merged == existing:
                return False
            pages[index] = merged
            pages.sort(
                key=lambda item: (
                    int(item.get("index") or 0),
                    int(item.get("split_index") or 0),
                )
            )
            rendered["page_count"] = len(pages)
            return True

    pages.append(dict(page))
    pages.sort(
        key=lambda item: (
            int(item.get("index") or 0),
            int(item.get("split_index") or 0),
        )
    )
    rendered["page_count"] = len(pages)
    return True


def _is_diego_preview_not_ready_error(exc: ExternalServiceException) -> bool:
    details = exc.details if isinstance(exc.details, dict) else {}
    status_code = details.get("status_code")
    try:
        parsed = int(status_code)
    except (TypeError, ValueError):
        parsed = 0
    return parsed in {404, 409}


def _preview_event_state_from_status(status: str) -> str:
    if status in {_DIEGO_STATUS_COMPILING, _DIEGO_STATUS_SUCCEEDED}:
        return GenerationState.RENDERING.value
    return GenerationState.GENERATING_CONTENT.value


async def _sync_pending_slide_previews(
    *,
    db,
    session_id: str,
    run,
    client,
    diego_run_id: str,
    diego_trace_id: Optional[str],
    diego_status: str,
    pending_slide_numbers: set[int],
    preview_payload: dict | None,
) -> tuple[set[int], dict]:
    if not pending_slide_numbers:
        return set(), preview_payload or {}

    payload = preview_payload or await _load_or_init_run_preview_payload(
        db=db,
        session_id=session_id,
        spectra_run_id=run.id,
    )
    remaining: set[int] = set()
    for slide_no in sorted(pending_slide_numbers):
        try:
            preview = await client.get_slide_preview(diego_run_id, slide_no)
        except ExternalServiceException as exc:
            if _is_diego_preview_not_ready_error(exc):
                remaining.add(slide_no)
                continue
            logger.warning(
                "Diego slide preview fetch failed: run=%s diego_run=%s slide_no=%s error=%s",
                run.id,
                diego_run_id,
                slide_no,
                exc,
                exc_info=True,
            )
            remaining.add(slide_no)
            continue
        except Exception as exc:
            logger.warning(
                "Diego slide preview fetch raised: run=%s diego_run=%s slide_no=%s error=%s",
                run.id,
                diego_run_id,
                slide_no,
                exc,
                exc_info=True,
            )
            remaining.add(slide_no)
            continue

        if not isinstance(preview, dict):
            remaining.add(slide_no)
            continue
        page = _build_spectra_preview_page(
            spectra_run_id=run.id,
            slide_no=slide_no,
            preview=preview,
        )
        if page is None:
            remaining.add(slide_no)
            continue
        changed = _upsert_rendered_preview_page(payload, page)
        if not changed:
            continue

        await save_preview_content(run.id, payload)
        rendered = payload.get("rendered_preview")
        page_count = (
            int(rendered.get("page_count") or 0) if isinstance(rendered, dict) else 0
        )
        event_payload = {
            "stage": "preview_slide_rendered",
            "run_id": run.id,
            "run_no": run.runNo,
            "run_title": run.title,
            "tool_type": run.toolType,
            "diego_run_id": diego_run_id,
            "diego_trace_id": diego_trace_id,
            "slide_no": slide_no,
            "slide_index": int(page.get("index") or 0),
            "slide_id": str(page.get("slide_id") or ""),
            "preview_ready": True,
            "html_preview_ready": bool(str(page.get("html_preview") or "").strip()),
            "page_count": page_count,
        }
        await append_event(
            db=db,
            schema_version=_SCHEMA_VERSION,
            session_id=session_id,
            event_type=GenerationEventType.PPT_SLIDE_GENERATED.value,
            state=_preview_event_state_from_status(diego_status),
            state_reason="preview_slide_rendered",
            progress=None,
            payload=event_payload,
        )
    return remaining, payload


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
        await append_event(
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
                session = await db.generationsession.find_unique(
                    where={"id": session_id}
                )
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
