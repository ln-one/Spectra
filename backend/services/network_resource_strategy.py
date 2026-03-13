"""D-8.6 网络资源策略层（AI/RAG 侧）。"""

from __future__ import annotations

import hashlib
import re
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

_TOKEN_RE = re.compile(r"[\u4e00-\u9fffA-Za-z0-9]{2,}")
_ASR_FILLERS = [
    "嗯",
    "啊",
    "额",
    "然后",
    "就是说",
    "这个",
    "那个",
]


def _tokenize(text: str) -> set[str]:
    return set(_TOKEN_RE.findall((text or "").lower()))


def _normalize_whitespace(text: str) -> str:
    compact = re.sub(r"\s+", " ", (text or "").strip())
    return compact.replace(" ，", "，").replace(" 。", "。")


def canonicalize_url(url: str) -> str:
    """Canonicalize URL for web deduplication."""
    if not url:
        return ""
    parsed = urlparse(url.strip())
    query_pairs = [
        (k, v)
        for k, v in parse_qsl(parsed.query, keep_blank_values=True)
        if not k.lower().startswith("utm_")
    ]
    canonical = parsed._replace(query=urlencode(query_pairs), fragment="")
    return urlunparse(canonical)


def _build_text_fingerprint(text: str) -> str:
    digest = hashlib.sha1(_normalize_whitespace(text).encode("utf-8")).hexdigest()
    return digest[:16]


def _compute_relevance_score(text: str, query: str) -> float:
    query_tokens = _tokenize(query)
    if not query_tokens:
        return 0.0
    text_lower = (text or "").lower()
    overlap = query_tokens & _tokenize(text_lower)
    lexical_score = len(overlap) / len(query_tokens)
    fuzzy_hit = sum(1 for token in query_tokens if token and token in text_lower)
    fuzzy_score = fuzzy_hit / len(query_tokens)
    return max(lexical_score, fuzzy_score)


def _compute_web_quality_score(resource: dict) -> float:
    title = str(resource.get("title", "") or "")
    content = str(resource.get("content", "") or "")
    url = str(resource.get("url", "") or "")

    score = 0.0
    if title:
        score += 0.2
    if url.startswith("http"):
        score += 0.2
    length = len(_normalize_whitespace(content))
    if length >= 120:
        score += 0.4
    elif length >= 60:
        score += 0.2
    if re.search(r"[\u4e00-\u9fffA-Za-z]", content):
        score += 0.2
    return min(score, 1.0)


def dedupe_web_resources(resources: list[dict]) -> list[dict]:
    """Deduplicate fetched web resources by canonical URL / content fingerprint."""
    deduped: list[dict] = []
    seen: set[str] = set()
    for item in resources or []:
        canonical_url = canonicalize_url(str(item.get("url", "") or ""))
        title = _normalize_whitespace(str(item.get("title", "") or ""))
        content = _normalize_whitespace(str(item.get("content", "") or ""))
        fingerprint = _build_text_fingerprint(f"{title}|{content[:240]}")
        dedupe_key = canonical_url or fingerprint
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        merged = dict(item)
        merged["canonical_url"] = canonical_url
        merged["dedupe_key"] = dedupe_key
        deduped.append(merged)
    return deduped


def prepare_web_knowledge_units(
    resources: list[dict],
    query: str,
    *,
    min_quality: float = 0.45,
    min_relevance: float = 0.1,
    top_k: int = 8,
) -> list[dict]:
    """Filter, dedupe, score and normalize web resources into ingest units."""
    units: list[dict] = []
    for idx, resource in enumerate(dedupe_web_resources(resources), start=1):
        content = _normalize_whitespace(str(resource.get("content", "") or ""))
        title = _normalize_whitespace(str(resource.get("title", "") or ""))
        quality_score = _compute_web_quality_score(resource)
        relevance_score = _compute_relevance_score(f"{title} {content}", query)
        if quality_score < min_quality or relevance_score < min_relevance:
            continue

        source_id = str(resource.get("id", f"web-{idx}"))
        chunk_id = f"web-{source_id}"
        citation = {
            "chunk_id": chunk_id,
            "source_type": "web",
            "filename": title or resource.get("canonical_url") or "web-resource",
        }
        units.append(
            {
                "chunk_id": chunk_id,
                "source_type": "web",
                "content": content,
                "metadata": {
                    "resource_id": source_id,
                    "title": title,
                    "url": resource.get("canonical_url") or resource.get("url"),
                    "quality_score": quality_score,
                    "relevance_score": relevance_score,
                },
                "citation": citation,
            }
        )

    units.sort(key=lambda x: x["metadata"]["relevance_score"], reverse=True)
    return units[:top_k]


def clean_asr_text(text: str) -> str:
    """Clean ASR transcript text for RAG ingestion."""
    normalized = _normalize_whitespace(text)
    for filler in _ASR_FILLERS:
        normalized = re.sub(
            rf"(?:^|[，,\s]){re.escape(filler)}(?:[，,\s]|$)", " ", normalized
        )
    normalized = re.sub(r"[，,]{2,}", "，", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip(" ，,")
    return normalized


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
                "source_type": "audio",
                "content": cleaned,
                "metadata": {
                    "audio_id": audio_id,
                    "confidence": confidence,
                    "start": start_ts,
                    "end": float(segment.get("end", start_ts) or start_ts),
                },
                "citation": {
                    "chunk_id": chunk_id,
                    "source_type": "audio",
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

        # Accept both strategy-native shape (summary/key_points/start/end)
        # and video_service shape (content/timestamp/chunk_id).
        summary = _normalize_whitespace(
            str(segment.get("summary", "") or segment.get("content", "") or "")
        )
        key_points = [
            _normalize_whitespace(str(item))
            for item in (segment.get("key_points") or [])
            if _normalize_whitespace(str(item))
        ]
        if not summary and not key_points:
            continue
        start_ts = float(segment.get("start", segment.get("timestamp", 0.0)) or 0.0)
        content = summary
        if key_points:
            content = (
                f"{summary}\n- " + "\n- ".join(key_points)
                if summary
                else "\n- ".join(f"- {p}" for p in key_points)
            )
        chunk_id = str(segment.get("chunk_id") or f"vid-{video_id}-{idx}")
        units.append(
            {
                "chunk_id": chunk_id,
                "source_type": "video",
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
                    "source_type": "video",
                    "filename": filename,
                    "timestamp": start_ts,
                },
            }
        )
    return units


def rank_units_by_relevance(
    units: list[dict], query: str, top_k: int = 12
) -> list[dict]:
    """Rank standardized units by lexical relevance."""
    ranked: list[dict] = []
    for unit in units or []:
        content = str(unit.get("content", "") or "")
        score = _compute_relevance_score(content, query)
        merged = dict(unit)
        metadata = dict(unit.get("metadata") or {})
        metadata["relevance_score"] = score
        merged["metadata"] = metadata
        ranked.append(merged)
    ranked.sort(
        key=lambda x: x.get("metadata", {}).get("relevance_score", 0.0), reverse=True
    )
    return ranked[:top_k]
