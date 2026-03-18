from services import db_service

from .shared import logger, rerank_by_chapter


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

        rag_filters = None
        if rag_source_ids:
            rag_filters = {"file_ids": rag_source_ids}
            try:
                selected_uploads = await db_service.db.upload.find_many(
                    where={
                        "projectId": project_id,
                        "id": {"in": rag_source_ids},
                    },
                    select={"filename": True, "status": True},
                )
                if selected_uploads:
                    names = [
                        f"{upload.filename}({upload.status})"
                        for upload in selected_uploads
                    ]
                    selected_files_hint = "已选资料（含解析状态）： " + "，".join(names)
            except Exception as file_err:
                logger.warning("Failed to load selected uploads: %s", file_err)

        rag_results = await _rag.search(
            project_id=project_id,
            query=query,
            top_k=5,
            score_threshold=0.3,
            session_id=session_id,
            filters=rag_filters,
        )
        rag_results = rerank_by_chapter(query, rag_results)
        if rag_results:
            rag_hit = True
            citations = [
                {
                    "chunk_id": result.source.chunk_id,
                    "source_type": result.source.source_type,
                    "filename": result.source.filename,
                    "page_number": result.source.page_number,
                    "timestamp": getattr(result.source, "timestamp", None),
                    "score": result.score,
                }
                for result in rag_results
            ]
            rag_payload = []
            for item in rag_results:
                source_obj = getattr(item, "source", None)
                source = {}
                if source_obj is not None:
                    for field in [
                        "chunk_id",
                        "source_type",
                        "filename",
                        "page_number",
                        "timestamp",
                        "preview_text",
                    ]:
                        value = getattr(source_obj, field, None)
                        if value is not None:
                            source[field] = value
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
        limit=10,
        session_id=session_id,
    )
    return [{"role": msg.role, "content": msg.content} for msg in recent_messages[-6:]]
