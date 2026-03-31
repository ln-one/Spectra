import asyncio
import time
from collections.abc import Iterable

from schemas.common import (
    build_source_reference_payload,
)
from services.database import db_service
from services.database.prisma_compat import find_many_with_select_fallback
from services.rag_service.context_postprocess import (
    log_context_processing,
    postprocess_rag_context,
    serialize_rag_results,
)
from services.system_settings_service import system_settings_service
from utils.upstream_failures import classify_upstream_failure

from .refine_context import rerank_by_chapter
from .shared import logger


def _normalize_requested_source_ids(source_ids) -> list[str]:
    if not source_ids:
        return []
    if isinstance(source_ids, (str, bytes)):
        return []
    if not isinstance(source_ids, Iterable):
        return []

    normalized: list[str] = []
    seen: set[str] = set()
    for source_id in source_ids:
        text = str(source_id or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        normalized.append(text)
    return normalized


def _normalize_upload_status(status) -> str:
    return str(status or "").strip().lower()


async def _search_rag_with_timeout(
    *,
    rag_service,
    project_id: str,
    query: str,
    session_id: str | None,
    rag_filters,
):
    timeout_seconds = system_settings_service.resolve_chat_rag_timeout_seconds()
    search_coro = rag_service.search(
        project_id=project_id,
        query=query,
        top_k=5,
        score_threshold=0.3,
        session_id=session_id,
        filters=rag_filters,
    )
    started_at = time.perf_counter()
    if timeout_seconds <= 0:
        return await search_coro, None, (time.perf_counter() - started_at) * 1000

    try:
        return (
            await asyncio.wait_for(search_coro, timeout=timeout_seconds),
            None,
            (time.perf_counter() - started_at) * 1000,
        )
    except asyncio.TimeoutError:
        logger.warning(
            (
                "RAG search timed out after %.2fs for project=%s; "
                "continuing without context"
            ),
            timeout_seconds,
            project_id,
        )
        return [], "rag_timeout", (time.perf_counter() - started_at) * 1000


async def load_rag_context(
    project_id: str, query: str, session_id: str | None, rag_source_ids
):
    requested_source_ids = _normalize_requested_source_ids(rag_source_ids)
    rag_results = []
    citations = []
    rag_hit = False
    selected_files_hint = ""
    rag_payload = None
    rag_failure_reason = None
    retrieval_latency_ms = 0.0

    try:
        from services.rag_service import rag_service as _rag

        rag_filters = (
            {"file_ids": requested_source_ids} if requested_source_ids else None
        )

        selected_uploads_task = None
        if requested_source_ids:
            selected_uploads_task = find_many_with_select_fallback(
                model=db_service.db.upload,
                where={
                    "projectId": project_id,
                    "id": {"in": requested_source_ids},
                },
                select={"id": True, "filename": True, "status": True},
            )

        rag_search_task = _search_rag_with_timeout(
            rag_service=_rag,
            project_id=project_id,
            query=query,
            session_id=session_id,
            rag_filters=rag_filters,
        )

        selected_uploads = []
        if selected_uploads_task is not None:
            selected_uploads_result, rag_results_result = await asyncio.gather(
                selected_uploads_task,
                rag_search_task,
                return_exceptions=True,
            )
            if isinstance(rag_results_result, Exception):
                raise rag_results_result
            rag_results, rag_failure_reason, retrieval_latency_ms = rag_results_result

            if isinstance(selected_uploads_result, Exception):
                logger.warning(
                    "Failed to load selected uploads, continue with rag results: %s",
                    selected_uploads_result,
                )
            elif selected_uploads_result:
                selected_uploads = list(selected_uploads_result)
                names = [
                    f"{upload.filename}({upload.status})" for upload in selected_uploads
                ]
                selected_files_hint = (
                    "Selected files (with parse status): " + ", ".join(names)
                )
            elif requested_source_ids and not rag_failure_reason:
                rag_failure_reason = "source_not_found"
        else:
            rag_results, rag_failure_reason, retrieval_latency_ms = (
                await rag_search_task
            )

        if selected_uploads and not rag_failure_reason:
            found_source_ids: set[str] = set()
            not_ready_uploads = []
            has_complete_source_ids = True
            for upload in selected_uploads:
                upload_id = str(getattr(upload, "id", "") or "").strip()
                if upload_id:
                    found_source_ids.add(upload_id)
                else:
                    has_complete_source_ids = False
                if _normalize_upload_status(getattr(upload, "status", "")) != "ready":
                    not_ready_uploads.append(upload)

            missing_source_ids = [
                source_id
                for source_id in requested_source_ids
                if source_id not in found_source_ids
            ]
            if has_complete_source_ids and missing_source_ids:
                rag_failure_reason = "source_not_found"
                logger.info(
                    "RAG selected sources missing in project: project=%s missing=%s",
                    project_id,
                    missing_source_ids,
                )
            elif not_ready_uploads and not rag_results:
                rag_failure_reason = "source_not_ready"
                logger.info(
                    "RAG selected sources not ready: project=%s source_count=%s",
                    project_id,
                    len(not_ready_uploads),
                )

        rag_results = rerank_by_chapter(query, rag_results)
        serialized_results = serialize_rag_results(rag_results)
        processed_rag_payload, diagnostics = await postprocess_rag_context(
            query=query,
            rag_results=serialized_results,
        )
        log_context_processing(
            request_logger=logger,
            retrieval_latency_ms=retrieval_latency_ms,
            diagnostics=diagnostics,
            project_id=project_id,
            query=query,
            session_id=session_id,
            caller="chat_message_flow",
        )
        effective_rag_payload = processed_rag_payload or serialized_results
        if effective_rag_payload:
            rag_payload = effective_rag_payload
            rag_hit = True
            citations = [
                build_source_reference_payload(
                    chunk_id=(item.get("source") or {}).get("chunk_id", ""),
                    source_type=(item.get("source") or {}).get("source_type"),
                    filename=(item.get("source") or {}).get("filename", ""),
                    page_number=(item.get("source") or {}).get("page_number"),
                    timestamp=(item.get("source") or {}).get("timestamp"),
                    score=item.get("score"),
                    content_preview=item.get("content"),
                )
                for item in effective_rag_payload
            ]
        elif not rag_failure_reason:
            rag_payload = None
            rag_failure_reason = "rag_no_match"
    except Exception as rag_exc:
        logger.warning("RAG search failed, continuing without context: %s", rag_exc)
        rag_failure_reason = classify_upstream_failure(rag_exc)

    return (
        rag_results,
        citations,
        rag_hit,
        selected_files_hint,
        rag_payload,
        rag_failure_reason,
    )


async def build_history_payload(project_id: str, session_id: str | None):
    recent_messages = await db_service.get_recent_conversation_messages(
        project_id=project_id,
        limit=6,
        session_id=session_id,
        select={"role": True, "content": True},
    )
    return [{"role": msg.role, "content": msg.content} for msg in recent_messages]
