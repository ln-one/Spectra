"""Helpers for formatting retrieved context inside prompts."""

from .constants import _RAG_CHUNK_MAX_CHARS


def _describe_scope(item: dict) -> str:
    metadata = item.get("metadata") or {}
    scope = metadata.get("source_scope")
    if scope == "local_session":
        return "当前会话资料"
    if scope == "local_project":
        return "当前库共享资料"
    if scope == "reference_base":
        return "主基底引用资料"
    if scope == "reference_auxiliary":
        priority = metadata.get("reference_priority")
        if priority is not None:
            return f"辅助引用资料(priority={priority})"
        return "辅助引用资料"
    return "当前库资料"


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
        scope_hint = _describe_scope(item)
        if len(content) > _RAG_CHUNK_MAX_CHARS:
            content = content[:_RAG_CHUNK_MAX_CHARS] + "...（已截断）"
        cite_hint = ""
        if chunk_id:
            cite_hint = (
                f'\n  <citation_tag><cite chunk_id="{chunk_id}"></cite></citation_tag>'
            )
        sections.append(
            f'<reference index="{i}">\n'
            f"  <filename>{filename}</filename>\n"
            f"  <scope>{scope_hint}</scope>\n"
            f"  <relevance>{score:.0%}</relevance>\n"
            f"  <content>{content}</content>"
            f"{cite_hint}\n"
            f"</reference>"
        )
    return "\n\n".join(sections)
