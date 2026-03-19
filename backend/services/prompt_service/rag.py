"""Helpers for formatting retrieved context inside prompts."""

from .constants import _RAG_CHUNK_MAX_CHARS


def format_rag_context(rag_results: list[dict]) -> str:
    """Format retrieved chunks into a compact, source-aware prompt section."""
    if not rag_results:
        return ""

    sections: list[str] = []
    for i, item in enumerate(rag_results, 1):
        source = item.get("source", {}) or {}
        chunk_id = source.get("chunk_id", "")
        filename = source.get("filename", "unknown_source")
        score = float(item.get("score", 0.0) or 0.0)
        content = str(item.get("content", "") or "")
        if len(content) > _RAG_CHUNK_MAX_CHARS:
            content = content[:_RAG_CHUNK_MAX_CHARS] + "...（已截断）"
        cite_hint = ""
        if chunk_id:
            cite_hint = f'\n可用引用标签：<cite chunk_id="{chunk_id}"></cite>'
        sections.append(
            f"参考资料 {i}（{filename}，相关度={score:.0%}）\n{content}{cite_hint}"
        )
    return "\n\n".join(sections)
