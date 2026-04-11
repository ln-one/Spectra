from __future__ import annotations

import logging
import re

from services.project_space_service.service import project_space_service

from .card_execution_runtime_helpers import artifact_metadata_dict

logger = logging.getLogger(__name__)


def normalize_word_base_title(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    text = re.sub(r"\.(pptx?|docx?)$", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"(课件|PPT)\s*$", "", text, flags=re.IGNORECASE).strip()
    return text[:120]


def compose_word_title(base: str) -> str:
    normalized = normalize_word_base_title(base)
    if not normalized:
        return "教学教案"
    if any(token in normalized for token in ("教案", "讲义", "文档", "逐字稿")):
        return normalized
    return f"{normalized}教案"


async def resolve_word_document_title(
    *,
    source_artifact_id: str,
    config: dict | None,
    existing_title: str,
) -> str:
    if existing_title:
        return compose_word_title(existing_title)

    source_id = str(source_artifact_id or "").strip()
    if source_id:
        try:
            source_artifact = await project_space_service.get_artifact(source_id)
            if source_artifact:
                source_metadata = artifact_metadata_dict(source_artifact)
                source_title = str(source_metadata.get("title") or "").strip()
                if source_title:
                    return compose_word_title(source_title)
        except Exception as exc:
            logger.warning(
                "Resolve word title from source artifact failed: source=%s error=%s",
                source_id,
                exc,
            )

    topic = ""
    if isinstance(config, dict):
        topic = str(config.get("topic") or config.get("title") or "").strip()
    return compose_word_title(topic)


async def sync_word_source_metadata(
    *,
    artifact,
    source_artifact_id: str,
) -> None:
    normalized_source_artifact_id = str(source_artifact_id or "").strip()
    if not normalized_source_artifact_id:
        return
    try:
        current_metadata = artifact_metadata_dict(artifact)
        await project_space_service.update_artifact_metadata(
            artifact.id,
            {
                **current_metadata,
                "source_artifact_id": normalized_source_artifact_id,
                "source_artifact_type": "pptx",
            },
        )
    except Exception as exc:
        logger.warning(
            "Skip word_document source metadata sync due to db error: %s", exc
        )
