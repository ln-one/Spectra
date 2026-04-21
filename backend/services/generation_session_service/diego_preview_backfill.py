"""Read-path backfill for Pagevra SVG authority previews via Diego."""

from __future__ import annotations

import logging
from typing import Iterable, Optional

from services.database import db_service
from services.diego_client import build_diego_client
from services.generation_session_service.diego_runtime_helpers import (
    get_diego_binding_from_options,
    parse_options,
)
from services.generation_session_service.diego_runtime_sync.events import (
    _extract_slide_numbers_from_run_detail,
)
from services.generation_session_service.diego_runtime_sync.preview_payload import (
    _build_spectra_preview_page,
    _load_or_init_run_preview_payload,
    _upsert_rendered_preview_page,
)
from services.preview_helpers.cache import save_preview_content
from utils.exceptions import ExternalServiceException

logger = logging.getLogger(__name__)


def _coerce_positive_int(value: object) -> int:
    if isinstance(value, bool):
        return 0
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return 0
    return parsed if parsed > 0 else 0


def _extract_existing_svg_slide_numbers(content: object) -> set[int]:
    if not isinstance(content, dict):
        return set()
    rendered = content.get("rendered_preview")
    if not isinstance(rendered, dict):
        return set()

    slide_numbers: set[int] = set()
    for page in rendered.get("pages", []) or []:
        if not isinstance(page, dict):
            continue
        svg_data_url = str(page.get("svg_data_url") or "").strip()
        preview_format = str(page.get("format") or "").strip().lower()
        if preview_format != "svg" or not svg_data_url.startswith(
            "data:image/svg+xml"
        ):
            continue
        page_index = _coerce_positive_int(page.get("index"))
        slide_numbers.add(page_index + 1 if page_index >= 0 else 1)
    return slide_numbers


def _extract_expected_slide_numbers_from_slides(slides: Iterable[dict]) -> set[int]:
    slide_numbers: set[int] = set()
    for fallback_index, slide in enumerate(slides, start=1):
        if not isinstance(slide, dict):
            continue
        index_value = slide.get("index")
        parsed_index = _coerce_positive_int(index_value)
        slide_numbers.add(parsed_index + 1 if parsed_index > 0 else fallback_index)
    return slide_numbers


def _extract_expected_slide_numbers_from_preview(content: object) -> set[int]:
    if not isinstance(content, dict):
        return set()
    rendered = content.get("rendered_preview")
    if not isinstance(rendered, dict):
        return set()
    slide_numbers: set[int] = set()
    for fallback_index, page in enumerate(rendered.get("pages", []) or [], start=1):
        if not isinstance(page, dict):
            continue
        page_index = _coerce_positive_int(page.get("index"))
        slide_numbers.add(page_index + 1 if page_index > 0 else fallback_index)
    return slide_numbers


def _attach_svg_pages_to_slides(slides: list[dict], content: dict) -> list[dict]:
    rendered = content.get("rendered_preview") if isinstance(content, dict) else None
    if not isinstance(rendered, dict):
        return slides

    page_by_slide_id: dict[str, dict] = {}
    page_by_index: dict[int, dict] = {}
    for page in rendered.get("pages", []) or []:
        if not isinstance(page, dict):
            continue
        svg_data_url = str(page.get("svg_data_url") or "").strip()
        if not svg_data_url:
            continue
        slide_id = str(page.get("slide_id") or "").strip()
        if slide_id:
            page_by_slide_id[slide_id] = page
        try:
            page_by_index[int(page.get("index") or 0)] = page
        except (TypeError, ValueError):
            continue

    next_slides: list[dict] = []
    for fallback_index, slide in enumerate(slides):
        if not isinstance(slide, dict):
            continue
        slide_copy = dict(slide)
        slide_id = str(slide_copy.get("id") or "").strip()
        page = page_by_slide_id.get(slide_id)
        if page is None:
            try:
                slide_index = int(slide_copy.get("index") or fallback_index)
            except (TypeError, ValueError):
                slide_index = fallback_index
            page = page_by_index.get(slide_index)
        if page is not None:
            slide_copy["thumbnail_url"] = page.get("svg_data_url")
            slide_copy["rendered_previews"] = [page]
        next_slides.append(slide_copy)
    return next_slides


async def _resolve_diego_binding(
    *,
    db,
    session_id: str,
    run_id: str,
    material_context: dict,
) -> Optional[dict]:
    artifact_metadata = material_context.get("artifact_metadata")
    if isinstance(artifact_metadata, dict):
        diego_run_id = str(artifact_metadata.get("diego_run_id") or "").strip()
        if diego_run_id:
            return {
                "diego_run_id": diego_run_id,
                "diego_trace_id": str(artifact_metadata.get("diego_trace_id") or "").strip()
                or None,
                "spectra_run_id": run_id,
            }

    session = await db.generationsession.find_unique(where={"id": session_id})
    if session is None:
        return None
    binding = get_diego_binding_from_options(
        parse_options(getattr(session, "options", None))
    )
    if not isinstance(binding, dict):
        return None
    bound_run_id = str(binding.get("spectra_run_id") or "").strip()
    if bound_run_id and bound_run_id != run_id:
        return None
    return dict(binding)


def _is_preview_not_ready(exc: ExternalServiceException) -> bool:
    details = exc.details if isinstance(exc.details, dict) else {}
    try:
        status_code = int(details.get("status_code") or 0)
    except (TypeError, ValueError):
        status_code = 0
    return status_code in {404, 409}


async def ensure_svg_authority_preview(
    *,
    session_id: str,
    run_id: Optional[str],
    material_context,
    slides: list[dict],
    content,
) -> tuple[list[dict], dict]:
    if not run_id or not isinstance(material_context, dict):
        return slides, content if isinstance(content, dict) else {}

    run = material_context.get("run")
    if run is None:
        run = await db_service.db.sessionrun.find_unique(where={"id": run_id})
    if run is None:
        return slides, content if isinstance(content, dict) else {}

    tool_type = str(getattr(run, "toolType", "") or "").strip()
    if tool_type and "courseware_ppt" not in tool_type:
        return slides, content if isinstance(content, dict) else {}

    payload = dict(content) if isinstance(content, dict) else {}
    existing_svg = _extract_existing_svg_slide_numbers(payload)
    expected = _extract_expected_slide_numbers_from_slides(slides)
    if not expected:
        expected = _extract_expected_slide_numbers_from_preview(payload)
    missing = expected - existing_svg if expected else set()
    if existing_svg:
        return _attach_svg_pages_to_slides(slides, payload), payload
    if expected and not missing:
        return _attach_svg_pages_to_slides(slides, payload), payload

    binding = await _resolve_diego_binding(
        db=db_service.db,
        session_id=session_id,
        run_id=run_id,
        material_context=material_context,
    )
    diego_run_id = str((binding or {}).get("diego_run_id") or "").strip()
    if not diego_run_id:
        logger.info(
            "preview_svg_backfill_skipped_no_diego_binding session_id=%s run_id=%s",
            session_id, run_id,
        )
        return slides, payload

    client = build_diego_client()
    if client is None:
        logger.warning(
            "preview_svg_backfill_skipped_diego_unavailable session_id=%s run_id=%s",
            session_id, run_id,
        )
        return slides, payload

    detail: dict[str, object] = {}
    if not missing:
        try:
            detail = await client.get_run(diego_run_id)
        except Exception as exc:
            logger.warning(
                "preview_svg_backfill_detail_failed session_id=%s run_id=%s diego_run_id=%s error=%s",
                session_id, run_id, diego_run_id, exc,
                exc_info=True,
            )
        else:
            expected = _extract_slide_numbers_from_run_detail(detail)
            missing = expected - existing_svg
    if not missing:
        return slides, payload

    if not payload:
        payload = await _load_or_init_run_preview_payload(
            db=db_service.db,
            session_id=session_id,
            spectra_run_id=run_id,
        )
    changed = False
    for slide_no in sorted(missing):
        try:
            preview = await client.get_slide_preview(diego_run_id, slide_no)
        except ExternalServiceException as exc:
            if _is_preview_not_ready(exc):
                logger.info(
                    "preview_svg_backfill_slide_not_ready session_id=%s run_id=%s diego_run_id=%s slide_no=%s",
                    session_id, run_id, diego_run_id, slide_no,
                )
                continue
            logger.warning(
                "preview_svg_backfill_slide_failed session_id=%s run_id=%s diego_run_id=%s slide_no=%s error=%s",
                session_id, run_id, diego_run_id, slide_no, exc,
                exc_info=True,
            )
            continue
        except Exception as exc:
            logger.warning(
                "preview_svg_backfill_slide_raised session_id=%s run_id=%s diego_run_id=%s slide_no=%s error=%s",
                session_id, run_id, diego_run_id, slide_no, exc,
                exc_info=True,
            )
            continue

        page = _build_spectra_preview_page(
            spectra_run_id=run_id,
            slide_no=slide_no,
            preview=preview,
        )
        if page is None:
            logger.warning(
                "preview_svg_backfill_invalid_manifest session_id=%s run_id=%s diego_run_id=%s slide_no=%s",
                session_id, run_id, diego_run_id, slide_no,
            )
            continue
        changed = _upsert_rendered_preview_page(payload, page) or changed

    if changed:
        rendered = payload.get("rendered_preview")
        if isinstance(rendered, dict):
            rendered["format"] = "svg"
        await save_preview_content(run_id, payload)
        logger.info(
            "preview_svg_backfill_saved session_id=%s run_id=%s diego_run_id=%s missing_count=%s",
            session_id, run_id, diego_run_id, len(missing),
        )

    return _attach_svg_pages_to_slides(slides, payload), payload
