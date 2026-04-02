"""Optional query rewrite hook for RAG retrieval."""

from __future__ import annotations


async def rewrite_query(query: str) -> str:
    """Default no-op rewrite to keep behavior stable."""
    return query
