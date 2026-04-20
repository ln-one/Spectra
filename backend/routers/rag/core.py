from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from schemas.rag import (
    PromptSuggestionRequest,
    RAGIndexRequest,
    RAGSearchRequest,
    RAGSimilarRequest,
)
from services.rag_api_service import (
    find_similar_response,
    get_source_detail_response,
    get_source_image_response,
    index_file_response,
    prompt_suggestions_response,
    search_knowledge_base_response,
)
from utils.dependencies import get_current_user
from utils.exceptions import APIException

from .shared import handle_rag_error

router = APIRouter()


@router.post("/search")
async def search_knowledge_base(
    request: RAGSearchRequest,
    user_id: str = Depends(get_current_user),
):
    """检索知识库"""
    try:
        return await search_knowledge_base_response(request)
    except APIException:
        raise
    except Exception as exc:
        raise handle_rag_error("检索失败", exc)


@router.post("/prompt-suggestions")
async def generate_prompt_suggestions(
    request: PromptSuggestionRequest,
    user_id: str = Depends(get_current_user),
):
    """基于 RAG 资料生成可复用的生成提示建议。"""
    try:
        return await prompt_suggestions_response(request, user_id)
    except APIException:
        raise
    except Exception as exc:
        raise handle_rag_error("生成提示建议失败", exc)


@router.get("/sources/{chunk_id}")
async def get_source_detail(
    chunk_id: str,
    project_id: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    """查看来源详情"""
    try:
        return await get_source_detail_response(chunk_id, project_id, user_id)
    except APIException:
        raise
    except Exception as exc:
        raise handle_rag_error("获取来源详情失败", exc)


@router.get("/sources/{chunk_id}/image")
async def get_source_image(
    chunk_id: str,
    path: str,
    project_id: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    """读取来源分块中的图片资源（按需缓存）。"""
    try:
        payload = await get_source_image_response(
            chunk_id=chunk_id,
            image_path=path,
            project_id=project_id,
            user_id=user_id,
        )
        return StreamingResponse(
            iter([payload.content]),
            media_type=payload.media_type,
            headers={
                "ETag": payload.etag,
                "Cache-Control": payload.cache_control,
            },
        )
    except APIException:
        raise
    except Exception as exc:
        raise handle_rag_error("获取来源图片失败", exc)


@router.post("/index")
async def index_file(
    request: RAGIndexRequest,
    user_id: str = Depends(get_current_user),
):
    """索引新文件到知识库（后台异步执行）"""
    return await index_file_response(request, user_id)


@router.post("/similar")
async def find_similar(
    request: RAGSimilarRequest,
    user_id: str = Depends(get_current_user),
):
    """查找相似内容"""
    try:
        return await find_similar_response(request, user_id)
    except APIException:
        raise
    except Exception as exc:
        raise handle_rag_error("查找相似内容失败", exc)
