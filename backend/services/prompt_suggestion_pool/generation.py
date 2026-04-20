from __future__ import annotations

import json
import logging

from fastapi import status

from schemas.rag import PromptSuggestionStatus, PromptSuggestionSurface
from services.ai.model_router import ModelRouteTask
from services.database import db_service
from services.prompt_service import (
    PROMPT_SUGGESTION_SURFACE_POLICIES,
    get_prompt_suggestion_retrieval_query,
    prompt_service,
)
from services.rag_service import rag_service
from utils.exceptions import ErrorCode, ExternalServiceException

from .constants import DEFAULT_PROMPT_SUGGESTION_POOL_SIZE
from .normalization import extract_json_object, normalize_suggestions, utc_now
from .storage import build_project_source_fingerprint, upsert_cache

logger = logging.getLogger(__name__)


async def generate_prompt_suggestion_pool(
    *,
    project_id: str,
    surface: PromptSuggestionSurface,
    source_fingerprint: str | None = None,
    db=db_service,
    pool_size: int = DEFAULT_PROMPT_SUGGESTION_POOL_SIZE,
) -> list[str]:
    resolved_fingerprint, source_count = await build_project_source_fingerprint(
        project_id,
        db=db,
    )
    fingerprint = source_fingerprint or resolved_fingerprint
    if source_count == 0:
        await _save_empty_pool(db, project_id, surface, fingerprint)
        return []

    retrieval_query = get_prompt_suggestion_retrieval_query(
        surface=surface,
        seed_text="",
    )
    rag_results = await rag_service.search(
        project_id=project_id,
        query=retrieval_query,
        top_k=12,
        filters=None,
        score_threshold=0.0,
    )
    if not rag_results:
        await _save_empty_pool(db, project_id, surface, fingerprint)
        return []

    rag_context = [item.model_dump() for item in rag_results]
    prompt = prompt_service.build_prompt_suggestion_prompt(
        surface=surface,
        seed_text="",
        rag_context=rag_context,
        limit=pool_size,
    )
    policy = PROMPT_SUGGESTION_SURFACE_POLICIES[surface]

    try:
        from services.ai import ai_service

        ai_result = await ai_service.generate(
            prompt=prompt,
            route_task=ModelRouteTask.PROMPT_SUGGESTION,
            has_rag_context=True,
            max_tokens=5000,
        )
        payload = extract_json_object(ai_result.get("content", ""))
        suggestions, summary = normalize_suggestions(
            payload,
            surface=surface,
            max_suggestion_chars=policy.suggestion_max_chars,
            limit=pool_size,
        )
    except ExternalServiceException as exc:
        await _save_failed_pool(
            db,
            project_id,
            surface,
            fingerprint,
            error_code=exc.error_code.value,
            error_message=exc.message,
        )
        raise
    except Exception as exc:
        logger.warning(
            "Prompt suggestion pool generation failed: project=%s surface=%s error=%s",
            project_id,
            surface.value,
            exc,
            exc_info=True,
        )
        await _save_failed_pool(
            db,
            project_id,
            surface,
            fingerprint,
            error_code=ErrorCode.UPSTREAM_UNAVAILABLE.value,
            error_message="生成提示建议池失败",
        )
        raise ExternalServiceException(
            message="生成提示建议池失败",
            status_code=status.HTTP_502_BAD_GATEWAY,
            error_code=ErrorCode.UPSTREAM_UNAVAILABLE,
            details={
                "reason": "prompt_suggestion_pool_generation_failed",
                "surface": surface.value,
            },
            retryable=True,
        ) from exc

    status_value = (
        PromptSuggestionStatus.READY
        if suggestions
        else PromptSuggestionStatus.EMPTY
    )
    await upsert_cache(
        db,
        project_id,
        surface,
        {
            "status": status_value.value,
            "suggestionsJson": json.dumps(suggestions, ensure_ascii=False),
            "summary": summary,
            "sourceFingerprint": fingerprint,
            "errorCode": None,
            "errorMessage": None,
            "generatedAt": utc_now(),
        },
    )
    return suggestions


async def _save_empty_pool(db, project_id, surface, source_fingerprint):
    await upsert_cache(
        db,
        project_id,
        surface,
        {
            "status": PromptSuggestionStatus.EMPTY.value,
            "suggestionsJson": "[]",
            "summary": None,
            "sourceFingerprint": source_fingerprint,
            "errorCode": None,
            "errorMessage": None,
            "generatedAt": utc_now(),
        },
    )


async def _save_failed_pool(
    db,
    project_id,
    surface,
    source_fingerprint,
    *,
    error_code,
    error_message,
):
    await upsert_cache(
        db,
        project_id,
        surface,
        {
            "status": PromptSuggestionStatus.FAILED.value,
            "sourceFingerprint": source_fingerprint,
            "errorCode": error_code,
            "errorMessage": error_message,
            "generatedAt": utc_now(),
        },
    )
