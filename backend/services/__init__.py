"""Compatibility exports for legacy service imports.

New production code should prefer explicit module imports instead of
``from services import ...`` to keep dependency boundaries visible.
"""

from importlib import import_module

_SERVICE_EXPORTS = {
    "AIService": (".ai", "AIService"),
    "ai_service": (".ai", "ai_service"),
    "DatabaseService": (".database", "DatabaseService"),
    "db_service": (".database", "db_service"),
    "EmbeddingService": (".media.embedding", "EmbeddingService"),
    "embedding_service": (".media.embedding", "embedding_service"),
    "FileService": (".file", "FileService"),
    "file_service": (".file", "file_service"),
    "PromptService": (".prompt_service", "PromptService"),
    "prompt_service": (".prompt_service", "prompt_service"),
    "RAGService": (".rag_service", "RAGService"),
    "rag_service": (".rag_service", "rag_service"),
    "rag_indexing": (".media", "rag_indexing"),
    "rag_indexing_service": (".media", "rag_indexing"),
}

__all__ = [
    "db_service",
    "DatabaseService",
    "ai_service",
    "AIService",
    "file_service",
    "FileService",
    "embedding_service",
    "EmbeddingService",
    "rag_service",
    "RAGService",
    "prompt_service",
    "PromptService",
    "rag_indexing",
    "rag_indexing_service",
]


def __getattr__(name):
    target = _SERVICE_EXPORTS.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, export_name = target
    module = import_module(module_name, __name__)
    return getattr(module, export_name)
