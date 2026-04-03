"""Optional cross-source reranker hook for RAG retrieval."""

from __future__ import annotations


def get_reranker():
    """Return None by default so retrieval can skip reranking safely."""
    return None
