"""D-8.6 网络资源策略层（AI/RAG 侧）。"""

from .av import audio_segments_to_units, video_segments_to_units
from .ranking import rank_units_by_relevance
from .text_utils import clean_asr_text
from .web import canonicalize_url, dedupe_web_resources, prepare_web_knowledge_units

__all__ = [
    "audio_segments_to_units",
    "canonicalize_url",
    "clean_asr_text",
    "dedupe_web_resources",
    "prepare_web_knowledge_units",
    "rank_units_by_relevance",
    "video_segments_to_units",
]
