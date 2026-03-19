"""Ranking helpers for normalized knowledge units."""

from __future__ import annotations

from .text_utils import compute_relevance_score


def rank_units_by_relevance(
    units: list[dict], query: str, top_k: int = 12
) -> list[dict]:
    """Rank standardized units by lexical relevance."""
    ranked: list[dict] = []
    for unit in units or []:
        content = str(unit.get("content", "") or "")
        score = compute_relevance_score(content, query)
        merged = dict(unit)
        metadata = dict(unit.get("metadata") or {})
        metadata["relevance_score"] = score
        merged["metadata"] = metadata
        ranked.append(merged)
    ranked.sort(
        key=lambda x: x.get("metadata", {}).get("relevance_score", 0.0), reverse=True
    )
    return ranked[:top_k]
