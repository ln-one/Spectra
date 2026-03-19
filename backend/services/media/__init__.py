"""Media-oriented services and external content adapters."""

from . import rag_indexing
from .audio import _safe_audio_duration, transcribe_audio
from .embedding import EmbeddingService, embedding_service
from .rag_indexing import index_upload_file_for_rag
from .vector import Collection, VectorService, vector_service
from .video import create_video_sources, process_video
from .web_search import WebSearchService, web_search_service

__all__ = [
    "_safe_audio_duration",
    "Collection",
    "EmbeddingService",
    "embedding_service",
    "index_upload_file_for_rag",
    "rag_indexing",
    "create_video_sources",
    "VectorService",
    "vector_service",
    "process_video",
    "transcribe_audio",
    "WebSearchService",
    "web_search_service",
]
