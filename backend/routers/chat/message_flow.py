import asyncio

from schemas.common import (
    build_source_reference_payload,
    extract_source_reference_payload,
)
from services.database import db_service

from .refine_context import rerank_by_chapter
from .shared import logger


async def load_rag_context(
    project_id: str, query: str, session_id: str | None, rag_source_ids
):
    rag_results = []
    citations = []
    rag_hit = False
    selected_files_hint = ""
    rag_payload = None
    try:
        from services.rag_service import rag_service as _rag

        rag_filters = {"file_ids": rag_source_ids} if rag_source_ids else None

        selected_uploads_task = None
        if rag_source_ids:
            selected_uploads_task = db_service.db.upload.find_many(
                where={
                    "projectId": project_id,
                    "id": {"in": rag_source_ids},
                },
                select={"filename": True, "status": True},
            )

        rag_search_task = _rag.search(
            project_id=project_id,
            query=query,
            top_k=5,
            score_threshold=0.3,
            session_id=session_id,
            filters=rag_filters,
        )

        if selected_uploads_task is not None:
            selected_uploads, rag_results = await asyncio.gather(
                selected_uploads_task, rag_search_task
            )
            if selected_uploads:
                names = [
                    f"{upload.filename}({upload.status})" for upload in selected_uploads
                ]
                selected_files_hint = "已选资料（含解析状态）： " + "，".join(names)
        else:
            rag_results = await rag_search_task

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
    except Exception as rag_exc:
        logger.warning("RAG search failed, continuing without context: %s", rag_exc)

    return rag_results, citations, rag_hit, selected_files_hint, rag_payload


async def build_history_payload(project_id: str, session_id: str | None):
    recent_messages = await db_service.get_recent_conversation_messages(
        project_id=project_id,
        limit=6,
        session_id=session_id,
        select={"role": True, "content": True},
    )
    return [{"role": msg.role, "content": msg.content} for msg in recent_messages]
