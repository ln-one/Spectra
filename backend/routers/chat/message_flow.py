import asyncio
from collections.abc import Iterable

from schemas.common import (
    build_source_reference_payload,
    extract_source_reference_payload,
)
from services.database import db_service
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


def _project_upload_fields(upload, *, select: dict | None = None) -> dict | object:
    if not select:
        return upload

    projected: dict[str, object] = {}
    for field_name, enabled in select.items():
        if not enabled:
            continue
        if isinstance(upload, dict):
            projected[field_name] = upload.get(field_name)
        else:
            projected[field_name] = getattr(upload, field_name, None)
    return projected


async def _search_rag_with_timeout(
    *,
    rag_service,
    project_id: str,
    query: str,
    session_id: str | None,
    rag_filters,
    selected_library_ids,
    search_local_project,
):
    timeout_seconds = system_settings_service.resolve_chat_rag_timeout_seconds()
    search_coro = rag_service.search(
        project_id=project_id,
        query=query,
        top_k=5,
        score_threshold=0.3,
        session_id=session_id,
        filters=rag_filters,
        selected_library_ids=selected_library_ids,
        search_local_project=search_local_project,
    )
    if timeout_seconds <= 0:
        return await search_coro, None

    try:
        return await asyncio.wait_for(search_coro, timeout=timeout_seconds), None
    except asyncio.TimeoutError:
        logger.warning(
            (
                "RAG search timed out after %.2fs for project=%s; "
                "continuing without context"
            ),
            timeout_seconds,
            project_id,
        )
        return [], "rag_timeout"


async def load_rag_context(
    project_id: str,
    query: str,
    session_id: str | None,
    rag_source_ids,
    selected_library_ids=None,
    search_local_project=True,
):
    requested_source_ids = _normalize_requested_source_ids(rag_source_ids)
    rag_results = []
    citations = []
    rag_hit = False
    selected_files_hint = ""
    rag_payload = None
    rag_failure_reason = None

    try:
        from services.rag_service import rag_service as _rag

        rag_filters = (
            {"file_ids": requested_source_ids} if requested_source_ids else None
        )

        selected_uploads_task = None
        if requested_source_ids:
            # Try to select only required fields for performance
            try:
                selected_uploads_task = db_service.db.upload.find_many(
                    where={
                        "projectId": project_id,
                        "id": {"in": requested_source_ids},
                    },
                    select={"id": True, "filename": True, "status": True},
                )
            except TypeError:
                # Fallback if select is not supported
                selected_uploads_task = db_service.db.upload.find_many(
                    where={
                        "projectId": project_id,
                        "id": {"in": requested_source_ids},
                    },
                )

        rag_search_task = _search_rag_with_timeout(
            rag_service=_rag,
            project_id=project_id,
            query=query,
            session_id=session_id,
            rag_filters=rag_filters,
            selected_library_ids=selected_library_ids,
            search_local_project=search_local_project,
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
            rag_results, rag_failure_reason = rag_results_result

            if isinstance(selected_uploads_result, Exception):
                logger.warning(
                    "Failed to load selected uploads, continue with rag results: %s",
                    selected_uploads_result,
                )
            elif selected_uploads_result:
                selected_uploads = [
                    _project_upload_fields(
                        upload,
                        select={"id": True, "filename": True, "status": True},
                    )
                    for upload in selected_uploads_result
                ]
                names = [
                    f"{upload.get('filename')}({upload.get('status')})"
                    for upload in selected_uploads
                ]
                selected_files_hint = (
                    "Selected files (with parse status): " + ", ".join(names)
                )
            elif requested_source_ids and not rag_failure_reason:
                rag_failure_reason = "source_not_found"
        else:
            rag_results, rag_failure_reason = await rag_search_task

        if selected_uploads and not rag_failure_reason:
            found_source_ids: set[str] = set()
            not_ready_uploads = []
            has_complete_source_ids = True
            for upload in selected_uploads:
                upload_id = str(upload.get("id", "") or "").strip()
                if upload_id:
                    found_source_ids.add(upload_id)
                else:
                    has_complete_source_ids = False
                if _normalize_upload_status(upload.get("status", "")) != "ready":
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
        if rag_results:
            rag_hit = True
            citations = [
                build_source_reference_payload(
                    chunk_id=result.source.chunk_id,
                    source_type=result.source.source_type,
                    filename=result.source.filename,
                    page_number=result.source.page_number,
                    timestamp=getattr(result.source, "timestamp", None),
                    score=result.score,
                    content_preview=getattr(result, "content", "")[:240],
                    source_scope=(getattr(result, "metadata", None) or {}).get(
                        "source_scope"
                    ),
                    source_library_id=(getattr(result, "metadata", None) or {}).get(
                        "source_library_id"
                    ),
                    source_library_name=(getattr(result, "metadata", None) or {}).get(
                        "source_library_name"
                    ),
                    source_artifact_id=(getattr(result, "metadata", None) or {}).get(
                        "source_artifact_id"
                    ),
                    source_artifact_title=(getattr(result, "metadata", None) or {}).get(
                        "source_artifact_title"
                    ),
                    source_artifact_tool_type=(
                        (getattr(result, "metadata", None) or {}).get(
                            "source_artifact_tool_type"
                        )
                    ),
                    source_artifact_session_id=(
                        (getattr(result, "metadata", None) or {}).get(
                            "source_artifact_session_id"
                        )
                    ),
                )
                for result in rag_results
            ]
            rag_payload = []
            for item in rag_results:
                source_obj = getattr(item, "source", None)
                source = (
                    extract_source_reference_payload(source_obj)
                    if source_obj is not None
                    else {}
                )
                rag_payload.append(
                    {
                        "content": getattr(item, "content", ""),
                        "score": getattr(item, "score", 0.0),
                        "source": source,
                    }
                )
        elif not rag_failure_reason:
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
