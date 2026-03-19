"""Web resource canonicalization, dedupe, and scoring helpers."""

from __future__ import annotations

import re
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from schemas.preview import SourceType

from .text_utils import (
    build_text_fingerprint,
    compute_relevance_score,
    normalize_whitespace,
)


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
    if query_pairs:
        query_pairs = sorted(query_pairs)
    canonical = parsed._replace(
        scheme=parsed.scheme.lower(),
        netloc=parsed.netloc.lower(),
        query=urlencode(query_pairs),
        fragment="",
    )
    return urlunparse(canonical)


def compute_web_quality_score(resource: dict) -> float:
    title = str(resource.get("title", "") or "")
    content = str(resource.get("content", "") or "")
    url = str(resource.get("url", "") or "")

    score = 0.0
    if title:
        score += 0.2
    if url.startswith("http"):
        score += 0.2
    length = len(normalize_whitespace(content))
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
        title = normalize_whitespace(str(item.get("title", "") or ""))
        content = normalize_whitespace(str(item.get("content", "") or ""))
        fingerprint = build_text_fingerprint(f"{title}|{content[:240]}")
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
        content = normalize_whitespace(str(resource.get("content", "") or ""))
        title = normalize_whitespace(str(resource.get("title", "") or ""))
        quality_score = compute_web_quality_score(resource)
        relevance_score = compute_relevance_score(f"{title} {content}", query)
        if quality_score < min_quality or relevance_score < min_relevance:
            continue

        source_id = str(resource.get("id", f"web-{idx}"))
        chunk_id = f"web-{source_id}"
        citation = {
            "chunk_id": chunk_id,
            "source_type": SourceType.WEB.value,
            "filename": title or resource.get("canonical_url") or "web-resource",
        }
        units.append(
            {
                "chunk_id": chunk_id,
                "source_type": SourceType.WEB.value,
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
