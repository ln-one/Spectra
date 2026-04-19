"""Pending Diego slide preview synchronization."""

from __future__ import annotations

from typing import Optional

from services.generation_session_service.run_constants import (
    RUN_STATUS_PROCESSING,
    RUN_STEP_PREVIEW,
)
from services.generation_session_service.run_lifecycle import update_session_run
from services.platform.generation_event_constants import GenerationEventType
from utils.exceptions import ExternalServiceException

from .constants import _SCHEMA_VERSION, logger
from .dependencies import active
from .preview_payload import (
    _build_spectra_preview_page,
    _is_diego_preview_not_ready_error,
    _load_or_init_run_preview_payload,
    _preview_event_state_from_status,
    _upsert_rendered_preview_page,
)


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
    preview_by_slide_no: dict[int, dict[str, object]] | None = None,
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
        preview = None
        if isinstance(preview_by_slide_no, dict):
            candidate = preview_by_slide_no.get(slide_no)
            if isinstance(candidate, dict):
                preview = candidate

        page = (
            _build_spectra_preview_page(
                spectra_run_id=run.id,
                slide_no=slide_no,
                preview=preview,
            )
            if isinstance(preview, dict)
            else None
        )
        if page is None:
            try:
                preview = await client.get_slide_preview(diego_run_id, slide_no)
            except ExternalServiceException as exc:
                if _is_diego_preview_not_ready_error(exc):
                    remaining.add(slide_no)
                    continue
                logger.warning(
                    "Diego slide preview fetch failed: run=%s diego_run=%s "
                    "slide_no=%s error=%s",
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
                    "Diego slide preview fetch raised: run=%s diego_run=%s "
                    "slide_no=%s error=%s",
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

        await active("save_preview_content")(run.id, payload)
        await update_session_run(
            db=db,
            run_id=run.id,
            status=RUN_STATUS_PROCESSING,
            step=RUN_STEP_PREVIEW,
        )
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
            "status": str(page.get("status") or "ready"),
            "preview_ready": True,
            "html_preview": str(page.get("html_preview") or ""),
            "html_preview_ready": bool(str(page.get("html_preview") or "").strip()),
            "preview_width": int(page.get("width") or 0) or None,
            "preview_height": int(page.get("height") or 0) or None,
            "is_final": True,
            "page_count": page_count,
        }
        await active("append_event")(
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
