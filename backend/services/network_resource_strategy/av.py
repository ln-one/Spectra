"""Audio/video segment normalization helpers."""

from __future__ import annotations

from typing import Any

from schemas.preview import SourceType

from .text_utils import clean_asr_text, normalize_whitespace


def audio_segments_to_units(
    audio_id: str,
    filename: str,
    segments: list[dict[str, Any]],
    *,
    min_confidence: float = 0.35,
) -> list[dict]:
    """Normalize ASR segments into citation-ready units."""
    units: list[dict] = []
    for idx, segment in enumerate(segments or [], start=1):
        confidence = float(segment.get("confidence", 0.0) or 0.0)
        if confidence < min_confidence:
            continue
        cleaned = clean_asr_text(str(segment.get("text", "") or ""))
        if len(cleaned) < 8:
            continue
        start_ts = float(segment.get("start", 0.0) or 0.0)
        chunk_id = f"aud-{audio_id}-{idx}"
        units.append(
            {
                "chunk_id": chunk_id,
                "source_type": SourceType.AUDIO.value,
                "content": cleaned,
                "metadata": {
                    "audio_id": audio_id,
                    "confidence": confidence,
                    "start": start_ts,
                    "end": float(segment.get("end", start_ts) or start_ts),
                },
                "citation": {
                    "chunk_id": chunk_id,
                    "source_type": SourceType.AUDIO.value,
                    "filename": filename,
                    "timestamp": start_ts,
                },
            }
        )
    return units


def video_segments_to_units(
    video_id: str,
    filename: str,
    segments: list[dict[str, Any]],
    *,
    min_confidence: float = 0.35,
) -> list[dict]:
    """Normalize video analysis output into retrieval/citation units."""
    units: list[dict] = []
    for idx, segment in enumerate(segments or [], start=1):
        confidence = float(segment.get("confidence", 0.0) or 0.0)
        if confidence < min_confidence:
            continue

        summary = normalize_whitespace(
            str(segment.get("summary", "") or segment.get("content", "") or "")
        )
        key_points = [
            normalize_whitespace(str(item))
            for item in (segment.get("key_points") or [])
            if normalize_whitespace(str(item))
        ]
        if not summary and not key_points:
            continue
        start_ts = float(segment.get("start", segment.get("timestamp", 0.0)) or 0.0)
        content = summary
        if key_points:
            content = (
                f"{summary}\n- " + "\n- ".join(key_points)
                if summary
                else "\n".join(f"- {p}" for p in key_points)
            )
        chunk_id = str(segment.get("chunk_id") or f"vid-{video_id}-{idx}")
        units.append(
            {
                "chunk_id": chunk_id,
                "source_type": SourceType.VIDEO.value,
                "content": content.strip(),
                "metadata": {
                    "video_id": video_id,
                    "confidence": confidence,
                    "start": start_ts,
                    "end": float(segment.get("end", start_ts) or start_ts),
                    "key_points": key_points,
                },
                "citation": {
                    "chunk_id": chunk_id,
                    "source_type": SourceType.VIDEO.value,
                    "filename": filename,
                    "timestamp": start_ts,
                },
            }
        )
    return units
