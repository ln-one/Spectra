from typing import Optional

from schemas.rag import RAGIndexRequest, RAGSearchRequest, RAGSimilarRequest
from services.database import db_service
from services.file_upload_service.constants import UploadStatus
from services.media.rag_indexing import index_upload_file_for_rag
from services.rag_service import rag_service
from utils.exceptions import ForbiddenException, NotFoundException
from utils.responses import success_response

from .access import (
    ensure_project_access,
    load_chunk_upload_info,
    resolve_chunk_project_and_upload,
)
from .source_images import load_source_image_payload


async def search_knowledge_base_response(request: RAGSearchRequest):
    filters = None
    if request.filters:
        filters = request.filters.model_dump(exclude_none=True)

    results = await rag_service.search(
        project_id=request.project_id,
        query=request.query,
        top_k=request.top_k,
        filters=filters,
    )
    return success_response(
        data={
            "results": [r.model_dump() for r in results],
            "total": len(results),
        },
        message="检索成功",
    )


async def get_source_detail_response(chunk_id: str, project_id: Optional[str]):
    resolved_project_id = project_id
    parsed = None
    if not resolved_project_id:
        resolved_project_id, parsed = await resolve_chunk_project_and_upload(chunk_id)

    detail = await rag_service.get_chunk_detail(
        chunk_id=chunk_id,
        project_id=resolved_project_id,
    )
    if not detail:
        raise NotFoundException(message=f"分块不存在: {chunk_id}")

    file_info = await load_chunk_upload_info(chunk_id, parsed=parsed)
    payload = detail.model_dump()
    if file_info:
        payload["file_info"] = file_info
    return success_response(data=payload, message="获取来源详情成功")


async def get_source_image_response(
    *,
    chunk_id: str,
    image_path: str,
    user_id: str,
    project_id: Optional[str] = None,
):
    resolved_project_id = project_id
    parsed = None
    if not resolved_project_id:
        resolved_project_id, parsed = await resolve_chunk_project_and_upload(chunk_id)
    if not resolved_project_id:
        raise NotFoundException(message=f"分块不存在: {chunk_id}")
    await ensure_project_access(resolved_project_id, user_id)
    return await load_source_image_payload(
        chunk_id=chunk_id,
        image_path=image_path,
        parsed=parsed,
    )


async def index_file_response(request: RAGIndexRequest, user_id: str):
    upload = await db_service.get_file(request.file_id)
    if not upload:
        raise NotFoundException(message=f"文件不存在: {request.file_id}")

    project = await db_service.get_project(upload.projectId)
    if not project or project.userId != user_id:
        raise ForbiddenException(message="无权限访问此文件")

    parse_result = await index_upload_file_for_rag(
        upload=upload,
        project_id=upload.projectId,
        chunk_size=request.chunk_size,
        chunk_overlap=request.chunk_overlap,
        reindex=True,
        db=db_service,
    )
    await db_service.update_upload_status(
        upload.id,
        status=UploadStatus.READY.value,
        parse_result=parse_result,
        error_message=None,
    )
    return success_response(
        data={
            "file_id": upload.id,
            "project_id": upload.projectId,
            "status": UploadStatus.READY.value,
            "parse_result": parse_result,
        },
        message="文件索引完成",
    )


async def find_similar_response(request: RAGSimilarRequest, user_id: str):
    await ensure_project_access(request.project_id, user_id)
    results = await rag_service.search(
        project_id=request.project_id,
        query=request.text,
        top_k=request.top_k,
    )
    filtered = [r for r in results if r.score >= request.threshold]
    return success_response(
        data={
            "results": [r.model_dump() for r in filtered],
            "total": len(filtered),
        },
        message="查找相似内容成功",
    )
