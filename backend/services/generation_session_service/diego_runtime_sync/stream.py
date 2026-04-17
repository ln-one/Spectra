"""Diego stream event append helpers."""

from __future__ import annotations

import re
from typing import Any, Optional

from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState

from .constants import _SCHEMA_VERSION
from .dependencies import active
from .events import _build_progress_message, _resolve_stream_channel

_DIEGO_THEME_KEYS = ("primary", "secondary", "accent", "light", "bg")
_DIEGO_CONTEXT_EVENTS = {
    "plan.completed",
    "requirements.analyzing.completed",
    "requirements.analyzed",
}


def _read_non_empty_str(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def _normalize_hex6(value: object) -> str | None:
    raw = _read_non_empty_str(value)
    if raw is None:
        return None
    candidate = raw.lstrip("#")
    if re.fullmatch(r"[0-9A-Fa-f]{3}", candidate):
        candidate = "".join(ch * 2 for ch in candidate)
    if not re.fullmatch(r"[0-9A-Fa-f]{6}", candidate):
        return None
    return candidate.upper()


def _normalize_theme(value: object) -> dict[str, str] | None:
    if not isinstance(value, dict):
        return None
    normalized: dict[str, str] = {}
    for key in _DIEGO_THEME_KEYS:
        parsed = _normalize_hex6(value.get(key))
        if parsed:
            normalized[key] = parsed
    return normalized or None


def _normalize_fonts(value: object) -> dict[str, str] | None:
    if not isinstance(value, dict):
        return None
    normalized: dict[str, str] = {}
    title = _read_non_empty_str(value.get("title"))
    body = _read_non_empty_str(value.get("body"))
    if title:
        normalized["title"] = title
    if body:
        normalized["body"] = body
    return normalized or None


def _extract_diego_preview_context_update(
    *,
    event_type: str,
    payload: dict[str, Any],
) -> dict[str, object]:
    if event_type not in _DIEGO_CONTEXT_EVENTS:
        return {}

    update: dict[str, object] = {}
    if event_type == "plan.completed":
        palette = _read_non_empty_str(payload.get("palette"))
        style = _read_non_empty_str(payload.get("style"))
        style_dna_id = _read_non_empty_str(payload.get("style_dna_id"))
        theme = _normalize_theme(payload.get("theme"))
        fonts = _normalize_fonts(payload.get("fonts"))
        if palette:
            update["palette"] = palette
        if style:
            update["style"] = style
        if style_dna_id:
            update["style_dna_id"] = style_dna_id
        if theme:
            update["theme"] = theme
        if fonts:
            update["fonts"] = fonts
        return update

    palette = _read_non_empty_str(payload.get("palette_name"))
    style = _read_non_empty_str(payload.get("style_recipe")) or _read_non_empty_str(
        payload.get("style_intent")
    )
    style_dna_id = _read_non_empty_str(payload.get("style_dna_id"))
    effective_template_style = _read_non_empty_str(
        payload.get("effective_template_style")
    )
    if palette:
        update["palette"] = palette
    if style:
        update["style"] = style
    if style_dna_id:
        update["style_dna_id"] = style_dna_id
    if effective_template_style:
        update["effective_template_style"] = effective_template_style
    return update


def _merge_diego_preview_context(
    *,
    existing: object,
    update: dict[str, object],
    run_id: str,
    seq: int,
) -> dict[str, object]:
    merged: dict[str, object] = dict(existing) if isinstance(existing, dict) else {}
    merged["provider"] = "diego"
    merged["run_id"] = run_id
    for field in ("palette", "style", "style_dna_id", "effective_template_style"):
        value = update.get(field)
        if isinstance(value, str) and value.strip():
            merged[field] = value.strip()

    theme_update = update.get("theme")
    if isinstance(theme_update, dict):
        theme_merged = (
            dict(merged.get("theme"))
            if isinstance(merged.get("theme"), dict)
            else {}
        )
        for key in _DIEGO_THEME_KEYS:
            value = theme_update.get(key)
            if isinstance(value, str) and value.strip():
                theme_merged[key] = value.strip()
        if theme_merged:
            merged["theme"] = theme_merged

    fonts_update = update.get("fonts")
    if isinstance(fonts_update, dict):
        fonts_merged = (
            dict(merged.get("fonts"))
            if isinstance(merged.get("fonts"), dict)
            else {}
        )
        for key in ("title", "body"):
            value = fonts_update.get(key)
            if isinstance(value, str) and value.strip():
                fonts_merged[key] = value.strip()
        if fonts_merged:
            merged["fonts"] = fonts_merged

    existing_seq_raw = merged.get("source_event_seq")
    try:
        existing_seq = int(existing_seq_raw)
    except (TypeError, ValueError):
        existing_seq = 0
    merged["source_event_seq"] = max(seq, existing_seq)
    return merged


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
    cached_preview_payload: dict[str, object] | None = None
    cached_preview_dirty = False
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
        context_update = _extract_diego_preview_context_update(
            event_type=event_type,
            payload=payload,
        )
        if context_update:
            if cached_preview_payload is None:
                cached = await active("load_preview_content")(spectra_run_id)
                cached_preview_payload = (
                    dict(cached) if isinstance(cached, dict) else {}
                )
            current_context = cached_preview_payload.get("diego_preview_context")
            merged_context = _merge_diego_preview_context(
                existing=current_context,
                update=context_update,
                run_id=spectra_run_id,
                seq=seq,
            )
            if merged_context != current_context:
                cached_preview_payload["diego_preview_context"] = merged_context
                cached_preview_dirty = True
        next_seq = seq
    if cached_preview_dirty and cached_preview_payload is not None:
        await active("save_preview_content")(spectra_run_id, cached_preview_payload)
    return next_seq
