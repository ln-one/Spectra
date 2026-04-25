"""Diego event extraction and stream metadata helpers."""

from __future__ import annotations

from .constants import (
    _DIEGO_EVENT_MESSAGE_MAP,
    _DIEGO_EVENT_SLIDE_GENERATED,
    _DIEGO_STREAM_CHANNEL_OUTLINE_TOKEN,
    _DIEGO_STREAM_CHANNEL_PREAMBLE,
)


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


def _extract_new_slide_payloads(
    *,
    diego_events: list[dict[str, object]],
    last_seq: int,
) -> tuple[int, dict[int, dict[str, object]]]:
    next_seq = last_seq
    slide_payloads: dict[int, dict[str, object]] = {}
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
            if slide_no >= 1:
                slide_payloads[slide_no] = dict(payload_obj)
        next_seq = seq
    return next_seq, slide_payloads


def _extract_slide_numbers_from_run_detail(detail: dict[str, object]) -> set[int]:
    raw = detail.get("slides")
    if not isinstance(raw, list):
        return set()

    slide_numbers: set[int] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            slide_no = int(item.get("slide_no") or 0)
        except (TypeError, ValueError):
            slide_no = 0
        if slide_no >= 1:
            slide_numbers.add(slide_no)
    return slide_numbers
