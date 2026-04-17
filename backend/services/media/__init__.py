"""Media-oriented services and external content adapters."""

from importlib import import_module

from .audio import _safe_audio_duration, transcribe_audio
from .embedding import EmbeddingService, embedding_service
from .video import create_video_sources, process_video
from .web_search import WebSearchService, web_search_service

__all__ = [
    "_safe_audio_duration",
    "EmbeddingService",
    "embedding_service",
    "index_upload_file_for_rag",
    "rag_indexing",
    "create_video_sources",
    "process_video",
    "transcribe_audio",
    "WebSearchService",
    "web_search_service",
]


def __getattr__(name):
    if name not in {"rag_indexing", "index_upload_file_for_rag"}:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module = import_module(".rag_indexing", __name__)
    return module if name == "rag_indexing" else getattr(module, name)
