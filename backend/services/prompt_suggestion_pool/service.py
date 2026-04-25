from __future__ import annotations

import logging

from fastapi import status

from schemas.rag import PromptSuggestionRequest, PromptSuggestionStatus
from services.database import db_service
from utils.exceptions import APIException, ErrorCode
from utils.responses import success_response

from .normalization import (
    decode_suggestions,
    normalize_datetime,
    paginate_suggestions,
    utc_now,
)
from .storage import (
    build_project_source_fingerprint,
    get_cache,
    mark_generating,
    resolve_response_status,
    should_refresh,
    upsert_cache,
)
from .constants import ALL_PROMPT_SUGGESTION_SURFACES

logger = logging.getLogger(__name__)


def enqueue_project_prompt_suggestion_refresh(
    *,
    task_queue_service,
    project_id: str,
    surfaces,
    source_fingerprint: str,
) -> bool:
    if task_queue_service is None:
        logger.warning(
            "prompt_suggestion_pool_queue_unavailable: project_id=%s surfaces=%s",
            project_id,
            [surface.value for surface in surfaces],
        )
        return False
    task_queue_service.enqueue_prompt_suggestion_pool_task(
        project_id=project_id,
        surfaces=[surface.value for surface in surfaces],
        source_fingerprint=source_fingerprint,
    )
    return True


async def enqueue_project_prompt_suggestion_refresh_from_env(
    *,
    project_id: str,
    surfaces,
    source_fingerprint: str,
) -> bool:
    from services.platform.redis_manager import RedisConnectionManager
    from services.task_queue import TaskQueueService

    manager = RedisConnectionManager.from_env()
    await manager.connect()
    try:
        service = TaskQueueService(manager.get_connection())
        return enqueue_project_prompt_suggestion_refresh(
            task_queue_service=service,
            project_id=project_id,
            surfaces=surfaces,
            source_fingerprint=source_fingerprint,
        )
    finally:
        await manager.disconnect()


async def prompt_suggestions_pool_response(
    request: PromptSuggestionRequest,
    user_id: str,
    *,
    task_queue_service=None,
):
    from services.rag_api_service.access import ensure_project_access

    await ensure_project_access(request.project_id, user_id)
    _reject_file_scoped_filters(request)

    source_fingerprint, source_count = await build_project_source_fingerprint(
        request.project_id
    )
    cache = await get_cache(db_service, request.project_id, request.surface)
    if source_count == 0:
        cache = await _save_empty_pool_marker(
            project_id=request.project_id,
            surface=request.surface,
            source_fingerprint=source_fingerprint,
        )
        needs_refresh = False
    else:
        needs_refresh = should_refresh(
            cache,
            source_fingerprint=source_fingerprint,
            force=request.refresh,
        )
        if needs_refresh:
            await mark_generating(
                db=db_service,
                project_id=request.project_id,
                surface=request.surface,
                source_fingerprint=source_fingerprint,
            )
            surfaces_to_enqueue = (
                list(ALL_PROMPT_SUGGESTION_SURFACES)
                if cache is None
                else [request.surface]
            )
            enqueue_project_prompt_suggestion_refresh(
                task_queue_service=task_queue_service,
                project_id=request.project_id,
                surfaces=surfaces_to_enqueue,
                source_fingerprint=source_fingerprint,
            )

    suggestions = decode_suggestions(getattr(cache, "suggestionsJson", None))
    batch, next_cursor = paginate_suggestions(
        suggestions,
        cursor=request.cursor or 0,
        limit=request.limit,
    )
    response_status = resolve_response_status(
        cache,
        needs_refresh=needs_refresh,
        has_suggestions=bool(suggestions),
    )
    generated_at = normalize_datetime(getattr(cache, "generatedAt", None))

    return success_response(
        data={
            "suggestions": batch,
            "summary": getattr(cache, "summary", None),
            "rag_hit": bool(source_count and suggestions),
            "status": response_status.value,
            "pool_size": len(suggestions),
            "generated_at": generated_at.isoformat() if generated_at else None,
            "next_cursor": next_cursor,
        },
        message="提示建议池读取成功",
    )


def _reject_file_scoped_filters(request: PromptSuggestionRequest) -> None:
    if request.filters and (request.filters.file_ids or request.filters.file_types):
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message="提示建议池暂不支持按选中文件过滤",
            details={"reason": "prompt_suggestion_pool_is_project_scoped"},
            retryable=False,
        )


async def _save_empty_pool_marker(*, project_id, surface, source_fingerprint):
    return await upsert_cache(
        db_service,
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
