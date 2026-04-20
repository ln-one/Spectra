from __future__ import annotations

import json
import logging
import re
from typing import Any

from fastapi import status

from schemas.rag import PromptSuggestionRequest
from services.ai.model_router import ModelRouteTask
from services.prompt_service import (
    PROMPT_SUGGESTION_SURFACE_POLICIES,
    get_prompt_suggestion_retrieval_query,
    prompt_service,
)
from services.rag_service import rag_service
from utils.exceptions import APIException, ErrorCode, ExternalServiceException
from utils.responses import success_response

from .access import ensure_project_access

logger = logging.getLogger(__name__)


def _extract_json_object(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        raise ValueError("empty model response")
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            raise
        parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("model response is not a JSON object")
    return parsed


def _normalize_text(value: Any, max_chars: int) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\s+", " ", text)
    if len(text) > max_chars:
        text = text[:max_chars].rstrip()
    return text


def _normalize_suggestions(
    payload: dict[str, Any],
    *,
    max_suggestion_chars: int,
    limit: int,
) -> tuple[list[str], str | None]:
    raw_suggestions = payload.get("suggestions")
    if not isinstance(raw_suggestions, list):
        raw_suggestions = []

    suggestions: list[str] = []
    seen: set[str] = set()
    for item in raw_suggestions:
        text = _normalize_text(item, max_suggestion_chars)
        if not text or text in seen:
            continue
        seen.add(text)
        suggestions.append(text)
        if len(suggestions) >= limit:
            break

    summary = _normalize_text(payload.get("summary"), 80)
    return suggestions, summary or None


async def prompt_suggestions_response(
    request: PromptSuggestionRequest,
    user_id: str,
):
    await ensure_project_access(request.project_id, user_id)

    filters = request.filters.model_dump(exclude_none=True) if request.filters else None
    seed_text = (request.seed_text or "").strip()
    retrieval_query = get_prompt_suggestion_retrieval_query(
        surface=request.surface,
        seed_text=seed_text,
    )
    rag_results = await rag_service.search(
        project_id=request.project_id,
        query=retrieval_query,
        top_k=6,
        filters=filters,
        score_threshold=0.0,
    )
    if not rag_results:
        raise APIException(
            status_code=status.HTTP_409_CONFLICT,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="暂无可用于生成提示的 RAG 资料",
            details={
                "reason": "insufficient_rag_context",
                "surface": request.surface.value,
            },
            retryable=False,
        )

    rag_context = [item.model_dump() for item in rag_results]
    prompt = prompt_service.build_prompt_suggestion_prompt(
        surface=request.surface,
        seed_text=seed_text,
        rag_context=rag_context,
        limit=request.limit,
    )

    try:
        from services.ai import ai_service

        ai_result = await ai_service.generate(
            prompt=prompt,
            route_task=ModelRouteTask.PROMPT_SUGGESTION,
            has_rag_context=True,
            max_tokens=900,
        )
        payload = _extract_json_object(ai_result.get("content", ""))
    except ExternalServiceException as exc:
        raise ExternalServiceException(
            message="生成提示建议失败",
            status_code=exc.status_code,
            error_code=exc.error_code,
            details={
                "reason": "prompt_suggestion_generation_failed",
                "surface": request.surface.value,
                "upstream": exc.details,
            },
            retryable=exc.retryable,
        ) from exc
    except APIException:
        raise
    except Exception as exc:
        logger.warning(
            "Prompt suggestion generation failed: project=%s surface=%s error=%s",
            request.project_id,
            request.surface.value,
            exc,
            exc_info=True,
        )
        raise ExternalServiceException(
            message="生成提示建议失败",
            status_code=status.HTTP_502_BAD_GATEWAY,
            error_code=ErrorCode.UPSTREAM_UNAVAILABLE,
            details={
                "reason": "prompt_suggestion_generation_failed",
                "surface": request.surface.value,
            },
            retryable=True,
        ) from exc

    policy = PROMPT_SUGGESTION_SURFACE_POLICIES[request.surface]
    suggestions, summary = _normalize_suggestions(
        payload,
        max_suggestion_chars=policy.suggestion_max_chars,
        limit=request.limit,
    )
    if not suggestions:
        raise APIException(
            status_code=status.HTTP_409_CONFLICT,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="资料不足，未生成可用提示建议",
            details={
                "reason": "insufficient_rag_context",
                "surface": request.surface.value,
            },
            retryable=False,
        )

    return success_response(
        data={
            "suggestions": suggestions,
            "summary": summary,
            "rag_hit": True,
        },
        message="提示建议生成成功",
    )
