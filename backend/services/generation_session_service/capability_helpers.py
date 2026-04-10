from __future__ import annotations

import json
import logging
import os
from typing import Optional

from schemas.generation import GenerationType
from services.chat import resolve_effective_rag_source_ids
from services.project_space_service.artifact_semantics import (
    resolve_capability_from_artifact,
)
from services.task_queue.status import (
    inspect_worker_availability,
    resolve_worker_availability,
)
from services.task_queue.status_constants import QueueWorkerAvailability

from .constants import SessionOutputType

logger = logging.getLogger(__name__)

_CANONICAL_TEMPLATE_STYLES = {"default", "teach", "gaia", "uncover", "academic"}
_TEACH_TEMPLATE_ID = "document-teaching"

_SESSION_TO_TASK_TYPE = {
    SessionOutputType.PPT.value: GenerationType.PPTX.value,
    SessionOutputType.WORD.value: GenerationType.DOCX.value,
    SessionOutputType.BOTH.value: GenerationType.BOTH.value,
    GenerationType.PPTX.value: GenerationType.PPTX.value,
    GenerationType.DOCX.value: GenerationType.DOCX.value,
}


def _parse_json_object(raw: Optional[str]) -> dict:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def resolve_template_config_from_options_dict(options: dict) -> dict:
    template_config = (
        dict(options.get("template_config"))
        if isinstance(options.get("template_config"), dict)
        else {}
    )
    template = str(options.get("template") or "").strip().lower()
    if template in _CANONICAL_TEMPLATE_STYLES and "style" not in template_config:
        template_config["style"] = template
    if template in _CANONICAL_TEMPLATE_STYLES and "template_id" not in template_config:
        template_config["template_id"] = _TEACH_TEMPLATE_ID
    return template_config


def _resolve_capability_from_artifact(artifact_type: str, metadata: dict) -> str:
    metadata_kind = str((metadata or {}).get("kind") or "").strip().lower()
    normalized_type = str(artifact_type or "").strip().lower()
    if not normalized_type:
        return "unknown"
    return resolve_capability_from_artifact(normalized_type, metadata_kind)


def _default_capabilities() -> list[dict]:
    from services.capability_health import get_all_capabilities_health

    health_status = get_all_capabilities_health()

    doc_parser_health = health_status.get("document_parser")
    video_health = health_status.get("video_understanding")
    speech_health = health_status.get("speech_recognition")
    animation_health = health_status.get("animation_rendering")

    default_model = os.getenv("DEFAULT_MODEL", "qwen3.5-flash")
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
            "name": "animation_rendering",
            "status": (
                animation_health.status.value if animation_health else "unavailable"
            ),
            "providers": [animation_health.provider] if animation_health else [],
            "default_provider": (
                animation_health.provider if animation_health else None
            ),
            "fallback_chain": (
                [animation_health.fallback_target]
                if (
                    animation_health
                    and animation_health.fallback_used
                    and animation_health.fallback_target
                )
                else []
            ),
            "operations": ["render_html", "render_gif", "render_mp4"],
            "status_message": (
                animation_health.user_message if animation_health else None
            ),
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
    if not isinstance(options, dict):
        return None
    template_config = resolve_template_config_from_options_dict(options)
    rag_source_ids = resolve_effective_rag_source_ids(
        rag_source_ids=options.get("rag_source_ids"),
        metadata=options,
    )
    if rag_source_ids:
        template_config["rag_source_ids"] = rag_source_ids
    return template_config if template_config else None


def _normalize_task_type(output_type: str, error_cls=ValueError) -> str:
    normalized = _SESSION_TO_TASK_TYPE.get((output_type or "").lower())
    if normalized is None:
        raise error_cls(f"不支持的 output_type: {output_type}")
    return normalized


def _is_queue_worker_available(task_queue_service) -> bool:
    availability = inspect_worker_availability(task_queue_service)
    return availability["status"] == QueueWorkerAvailability.AVAILABLE.value


def _inspect_queue_worker_availability(task_queue_service) -> dict:
    return inspect_worker_availability(task_queue_service)


async def _resolve_queue_worker_availability(
    task_queue_service,
    *,
    retries: int = 1,
    retry_delay_seconds: float = 0.15,
) -> dict:
    availability = await resolve_worker_availability(
        task_queue_service,
        retries=retries,
        retry_delay_seconds=retry_delay_seconds,
    )
    if availability["status"] == QueueWorkerAvailability.UNKNOWN.value:
        logger.warning(
            "Queue worker availability remains unknown after retry: error=%s",
            availability.get("error"),
        )
    return availability
