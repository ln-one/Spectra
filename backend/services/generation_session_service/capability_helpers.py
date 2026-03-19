from __future__ import annotations

import json
import logging
import os
from typing import Optional

from services.project_space_service.artifact_semantics import get_artifact_capability

logger = logging.getLogger(__name__)

_SESSION_TO_TASK_TYPE = {
    "ppt": "pptx",
    "word": "docx",
    "both": "both",
    "pptx": "pptx",
    "docx": "docx",
}


def _parse_json_object(raw: Optional[str]) -> dict:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _resolve_capability_from_artifact(artifact_type: str, metadata: dict) -> str:
    normalized_type = str(artifact_type or "").strip().lower()
    metadata_kind = str((metadata or {}).get("kind") or "").strip().lower()

    if normalized_type == "summary" and metadata_kind == "outline":
        return "outline"
    if normalized_type == "docx" and metadata_kind == "handout":
        return "handout"
    if normalized_type == "html" and metadata_kind == "animation_storyboard":
        return "animation"
    if normalized_type:
        return get_artifact_capability(normalized_type)
    return normalized_type or "unknown"


def _default_capabilities() -> list[dict]:
    from services.capability_health import get_all_capabilities_health

    health_status = get_all_capabilities_health()

    doc_parser_health = health_status.get("document_parser")
    video_health = health_status.get("video_understanding")
    speech_health = health_status.get("speech_recognition")

    default_model = os.getenv("DEFAULT_MODEL", "qwen3.5-plus")
    llm_provider = (
        default_model.split("/", 1)[0] if "/" in default_model else default_model
    )

    return [
        {
            "name": "outline_generation",
            "status": "available",
            "providers": [llm_provider],
            "default_provider": llm_provider,
            "fallback_chain": [],
            "operations": ["draft", "redraft", "confirm"],
            "status_message": None,
        },
        {
            "name": "document_parser",
            "status": (
                doc_parser_health.status.value if doc_parser_health else "unavailable"
            ),
            "providers": [doc_parser_health.provider] if doc_parser_health else [],
            "default_provider": (
                doc_parser_health.provider if doc_parser_health else None
            ),
            "fallback_chain": (
                [doc_parser_health.fallback_target]
                if (
                    doc_parser_health
                    and doc_parser_health.fallback_used
                    and doc_parser_health.fallback_target
                )
                else []
            ),
            "operations": ["parse"],
            "status_message": (
                doc_parser_health.user_message if doc_parser_health else None
            ),
        },
        {
            "name": "video_understanding",
            "status": video_health.status.value if video_health else "unavailable",
            "providers": [video_health.provider] if video_health else [],
            "default_provider": video_health.provider if video_health else None,
            "fallback_chain": (
                [video_health.fallback_target]
                if (
                    video_health
                    and video_health.fallback_used
                    and video_health.fallback_target
                )
                else []
            ),
            "operations": ["understand"],
            "status_message": video_health.user_message if video_health else None,
        },
        {
            "name": "speech_recognition",
            "status": speech_health.status.value if speech_health else "unavailable",
            "providers": [speech_health.provider] if speech_health else [],
            "default_provider": speech_health.provider if speech_health else None,
            "fallback_chain": (
                [speech_health.fallback_target]
                if (
                    speech_health
                    and speech_health.fallback_used
                    and speech_health.fallback_target
                )
                else []
            ),
            "operations": ["transcribe"],
            "status_message": speech_health.user_message if speech_health else None,
        },
        {
            "name": "slide_regeneration",
            "status": "available",
            "providers": [llm_provider],
            "default_provider": llm_provider,
            "fallback_chain": [],
            "operations": ["regenerate"],
            "status_message": None,
        },
        {
            "name": "event_stream",
            "status": "available",
            "providers": ["sse"],
            "default_provider": "sse",
            "fallback_chain": ["polling"],
            "operations": ["subscribe"],
            "status_message": None,
        },
    ]


def _extract_template_config(options_raw: Optional[str]) -> Optional[dict]:
    if not options_raw:
        return None
    try:
        options = json.loads(options_raw)
    except (TypeError, json.JSONDecodeError):
        return None
    template_config = options.get("template_config")
    return template_config if isinstance(template_config, dict) else None


def _normalize_task_type(output_type: str, error_cls=ValueError) -> str:
    normalized = _SESSION_TO_TASK_TYPE.get((output_type or "").lower())
    if normalized is None:
        raise error_cls(f"不支持的 output_type: {output_type}")
    return normalized


def _is_queue_worker_available(task_queue_service) -> bool:
    if task_queue_service is None:
        return False
    try:
        queue_info = task_queue_service.get_queue_info()
        if not isinstance(queue_info, dict):
            return True
        worker_count = int(((queue_info.get("workers") or {}).get("count") or 0))
        return worker_count > 0
    except Exception as exc:
        logger.warning("Failed to inspect queue worker availability: %s", exc)
        return True
