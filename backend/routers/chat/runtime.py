import asyncio
import os
import time
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi.encoders import jsonable_encoder

from schemas.chat import ChatRouteTask, SendMessageRequest
from services.chat import resolve_effective_rag_source_ids
from services.database import db_service
from services.generation_session_service.access import get_owned_session
from services.generation_session_service.session_history import (
    SESSION_TITLE_SOURCE_DEFAULT,
    generate_semantic_session_title,
    spawn_background_task,
)
from services.prompt_service import build_prompt_traceability
from utils.exceptions import (
    APIException,
    ErrorCode,
    ForbiddenException,
    InternalServerException,
)
from utils.responses import success_response

from .citation_utils import (
    align_citations_with_content,
    append_citation_markers,
    sanitize_cite_tags,
)
from .observability import (
    FEW_SHOT_VERSION,
    PROMPT_TEMPLATE_VERSION,
    build_observability_metadata,
    prompt_hash,
    response_hash,
)
from .runtime_helpers import (
    build_chat_prompt,
    build_image_analysis_hint,
    generate_assistant_reply,
    load_chat_context,
    persist_assistant_message,
)
from .shared import logger, to_message, verify_project_ownership


def _get_generation_session_lookup_db():
    return db_service.db


def _inline_title_refresh_timeout_seconds() -> float:
    raw = os.getenv("CHAT_SESSION_TITLE_INLINE_TIMEOUT_SECONDS", "1.2")
    try:
        timeout = float(str(raw).strip())
    except ValueError:
        return 1.2
    if timeout <= 0:
        return 0.0
    return min(timeout, 3.0)


def _derive_first_message_title(first_message: str, *, max_length: int = 18) -> str:
    compact = " ".join((first_message or "").strip().split())
    if not compact:
        return ""
    return compact[:max_length]


async def _fallback_first_message_title_refresh(
    *,
    session_id: str,
    first_message: str,
) -> dict | None:
    if not hasattr(db_service.db.generationsession, "update"):
        return None
    title = _derive_first_message_title(first_message)
    if not title:
        return None
    try:
        updated = await db_service.db.generationsession.update(
            where={"id": session_id},
            data={
                "displayTitle": title,
                "displayTitleSource": SESSION_TITLE_SOURCE_DEFAULT,
                "displayTitleUpdatedAt": datetime.now(timezone.utc),
            },
        )
    except Exception as exc:
        logger.warning(
            "Fallback session title refresh failed: session=%s error=%s",
            session_id,
            exc,
        )
        return None
    return {
        "display_title": getattr(updated, "displayTitle", None),
        "display_title_source": getattr(updated, "displayTitleSource", None),
        "display_title_updated_at": (
            updated.displayTitleUpdatedAt.isoformat()
            if getattr(updated, "displayTitleUpdatedAt", None)
            else None
        ),
    }


async def _ensure_chat_session(
    *,
    project_id: str,
    user_id: str,
    session_id: str | None,
) -> str:
    if not session_id:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="session_id is required. Please create/select a session first.",
        )

    try:
        session = await get_owned_session(
            db=_get_generation_session_lookup_db(),
            session_id=session_id,
            user_id=user_id,
        )
    except ValueError as exc:
        raise APIException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            message="Session not found.",
        ) from exc
    except PermissionError as exc:
        raise ForbiddenException(
            message="No permission to access this session."
        ) from exc

    session_project_id = (
        session.get("projectId") if isinstance(session, dict) else session.projectId
    )
    if session_project_id != project_id:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="session_id does not belong to this project.",
        )

    return session_id


async def process_chat_message(
    body: SendMessageRequest,
    *,
    user_id: str,
    idempotency_key: UUID | None = None,
):
    try:
        request_started = time.perf_counter()
        stage_timings_ms: dict[str, float] = {}

        stage_started = time.perf_counter()
        project = await verify_project_ownership(body.project_id, user_id)
        stage_timings_ms["verify_project"] = round(
            (time.perf_counter() - stage_started) * 1000, 2
        )

        stage_started = time.perf_counter()
        session_id = await _ensure_chat_session(
            project_id=body.project_id,
            user_id=user_id,
            session_id=body.session_id,
        )
        stage_timings_ms["ensure_session"] = round(
            (time.perf_counter() - stage_started) * 1000, 2
        )

        key_str = str(idempotency_key) if idempotency_key else None
        cache_key = (
            f"chat:messages:{user_id}:{body.project_id}:{session_id}:{key_str}"
            if key_str
            else None
        )
        if cache_key:
            stage_started = time.perf_counter()
            cached_response = await db_service.get_idempotency_response(cache_key)
            stage_timings_ms["idempotency_lookup"] = round(
                (time.perf_counter() - stage_started) * 1000, 2
            )
            if cached_response:
                return cached_response

        user_message_metadata = {
            **(body.metadata or {}),
            **(
                {"rag_source_ids": body.rag_source_ids}
                if body.rag_source_ids is not None
                else {}
            ),
            **({"idempotency_key": key_str} if key_str else {}),
            **({"session_id": session_id} if session_id else {}),
        } or None
        stage_started = time.perf_counter()
        await db_service.create_conversation_message(
            project_id=body.project_id,
            role="user",
            content=body.content,
            metadata=user_message_metadata,
            session_id=session_id,
        )
        stage_timings_ms["persist_user_message"] = round(
            (time.perf_counter() - stage_started) * 1000, 2
        )

        session_title_updated = False
        session_title = None
        session_title_source = None
        try:
            session_record = await db_service.db.generationsession.find_unique(
                where={"id": session_id}
            )
            session_title = getattr(session_record, "displayTitle", None)
            session_title_source = getattr(session_record, "displayTitleSource", None)
            user_message_count = await db_service.db.conversation.count(
                where={
                    "projectId": body.project_id,
                    "sessionId": session_id,
                    "role": "user",
                }
            )
            if (
                user_message_count == 1
                and session_title_source == SESSION_TITLE_SOURCE_DEFAULT
            ):
                refreshed = None
                fallback_applied = False
                if hasattr(db_service.db.generationsession, "update"):
                    inline_timeout = _inline_title_refresh_timeout_seconds()
                    if inline_timeout > 0:
                        try:
                            refreshed = await asyncio.wait_for(
                                generate_semantic_session_title(
                                    db=db_service.db,
                                    session_id=session_id,
                                    first_message=body.content,
                                ),
                                timeout=inline_timeout,
                            )
                        except Exception as exc:
                            logger.warning(
                                "Inline session title refresh fallback: session=%s "
                                "error=%s",
                                session_id,
                                exc,
                            )
                if not refreshed:
                    refreshed = await _fallback_first_message_title_refresh(
                        session_id=session_id,
                        first_message=body.content,
                    )
                    fallback_applied = bool(refreshed)
                if refreshed:
                    session_title_updated = True
                    session_title = refreshed.get("display_title")
                    session_title_source = refreshed.get("display_title_source")
                    if fallback_applied:
                        spawn_background_task(
                            generate_semantic_session_title(
                                db=db_service.db,
                                session_id=session_id,
                                first_message=body.content,
                            ),
                            label=f"session-title:{session_id}",
                        )
                else:
                    spawn_background_task(
                        generate_semantic_session_title(
                            db=db_service.db,
                            session_id=session_id,
                            first_message=body.content,
                        ),
                        label=f"session-title:{session_id}",
                    )
        except Exception as exc:
            logger.warning(
                "Skip async session title refresh: session=%s error=%s",
                session_id,
                exc,
            )

        rag_result, history_payload, context_timings = await load_chat_context(
            body=body,
            session_id=session_id,
        )
        (
            _rag_results,
            citations,
            rag_hit,
            selected_files_hint,
            rag_payload,
            rag_failure_reason,
        ) = rag_result
        stage_timings_ms.update(context_timings)
        effective_rag_source_ids = resolve_effective_rag_source_ids(
            rag_source_ids=body.rag_source_ids,
            metadata=body.metadata,
        )

        image_hint_started = time.perf_counter()
        (
            image_analysis_hint,
            image_analysis_reason,
            image_analysis_model,
        ) = await build_image_analysis_hint(
            project_id=body.project_id,
            user_message=body.content,
            rag_results=_rag_results,
            requested_source_ids=effective_rag_source_ids,
        )
        stage_timings_ms["image_hint_ms"] = round(
            (time.perf_counter() - image_hint_started) * 1000, 2
        )

        prompt = build_chat_prompt(
            body=body,
            project_name=project.name,
            session_id=session_id,
            rag_hit=rag_hit,
            selected_files_hint=selected_files_hint,
            rag_payload=rag_payload,
            history_payload=history_payload,
            image_analysis_hint=image_analysis_hint,
        )

        request_id = str(uuid4())
        prompt_digest = prompt_hash(prompt)
        assistant_content, generation_meta, generation_timings = (
            await generate_assistant_reply(
                prompt=prompt,
                rag_hit=rag_hit,
            )
        )
        stage_timings_ms.update(generation_timings)
        route_info = generation_meta["route_info"]
        selected_model = generation_meta["selected_model"]
        provider_model = generation_meta["provider_model"]
        fallback_triggered = generation_meta["fallback_triggered"]
        mechanical_pattern_hit = generation_meta["mechanical_pattern_hit"]
        latency_ms = generation_meta["latency_ms"]
        assistant_digest = generation_meta["assistant_digest"]

        assistant_digest = assistant_digest or response_hash(assistant_content)
        assistant_content = sanitize_cite_tags(assistant_content, citations)
        assistant_content = append_citation_markers(assistant_content, citations)
        citations = align_citations_with_content(assistant_content, citations)

        observability_metadata = build_observability_metadata(
            request_id=request_id,
            route_task=ChatRouteTask.CHAT_RESPONSE,
            selected_model=selected_model,
            provider_model=provider_model,
            has_rag_context=rag_hit,
            rag_failure_reason=rag_failure_reason,
            rag_query_length=len(body.content or ""),
            prompt_digest=prompt_digest,
            response_digest=assistant_digest,
            mechanical_pattern_hit=mechanical_pattern_hit,
            fallback_triggered=fallback_triggered,
            latency_ms=latency_ms,
            route_decision=route_info,
        )
        observability_metadata["prompt_template_version"] = PROMPT_TEMPLATE_VERSION
        observability_metadata["few_shot_version"] = FEW_SHOT_VERSION
        observability_metadata.update(
            build_prompt_traceability(rag_source_ids=effective_rag_source_ids)
        )
        observability_metadata["stage_timings_ms"] = stage_timings_ms

        observability_with_rag = {
            "rag_hit": rag_hit,
            "image_analysis_applied": bool(image_analysis_hint),
            "image_analysis_reason": image_analysis_reason,
            "vision_model": image_analysis_model,
            **observability_metadata,
        }
        assistant_msg, persist_ms = await persist_assistant_message(
            body=body,
            session_id=session_id,
            assistant_content=assistant_content,
            citations=citations,
            observability_metadata=observability_with_rag,
        )
        stage_timings_ms["persist_ms"] = persist_ms
        total_duration_ms = round((time.perf_counter() - request_started) * 1000, 2)
        observability_metadata["total_duration_ms"] = total_duration_ms
        logger.info(
            "chat_pipeline project=%s session=%s rag_hit=%s "
            "image_analysis_applied=%s image_analysis_reason=%s vision_model=%s "
            "total=%sms stages=%s",
            body.project_id,
            session_id,
            rag_hit,
            bool(image_analysis_hint),
            image_analysis_reason,
            image_analysis_model,
            total_duration_ms,
            stage_timings_ms,
        )

        msg_dict = to_message(assistant_msg)
        msg_dict["citations"] = citations or []

        response_payload = success_response(
            data={
                "session_id": session_id,
                "message": msg_dict,
                "rag_hit": rag_hit,
                "suggestions": [
                    "Refine teaching goals",
                    "Add key points",
                    "Start generating courseware",
                ],
                "observability": observability_metadata,
                "session_title_updated": session_title_updated,
                "session_title": session_title,
                "session_title_source": session_title_source,
            },
            message="Message sent successfully",
        )
        if cache_key:
            await db_service.save_idempotency_response(
                cache_key,
                jsonable_encoder(response_payload),
            )
        return response_payload
    except APIException:
        raise
    except Exception as exc:
        logger.error("Send message failed: %s", exc, exc_info=True)
        debug_mode = os.getenv("DEBUG", "false").lower() == "true"
        details = {
            "project_id": body.project_id,
            "session_id": body.session_id,
        }
        if debug_mode:
            details.update(
                {
                    "exception_type": type(exc).__name__,
                    "exception_message": str(exc),
                }
            )
        raise InternalServerException(
            message="Failed to send message",
            details=details,
        )
