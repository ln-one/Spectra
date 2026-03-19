from fastapi import APIRouter, Depends, File, Form, Query, UploadFile

from services.rag_api_service import (
    analyze_video_response,
    transcribe_audio_response,
    web_search_response,
)
from utils.dependencies import get_current_user
from utils.exceptions import APIException

from .shared import handle_rag_error

router = APIRouter()


@router.post("/web-search")
async def web_search(
    query: str = Query(..., min_length=1),
    project_id: str = Query(..., min_length=1),
    max_results: int = Query(10, ge=1, le=20),
    auto_index: bool = Query(False),
    user_id: str = Depends(get_current_user),
):
    """搜索网络资源并可选自动入库"""
    try:
        return await web_search_response(
            query=query,
            project_id=project_id,
            max_results=max_results,
            auto_index=auto_index,
            user_id=user_id,
        )
    except APIException:
        raise
    except Exception as exc:
        raise handle_rag_error("网络搜索失败", exc)


@router.post("/audio-transcribe")
async def transcribe_audio_endpoint(
    file: UploadFile = File(...),
    project_id: str = Form(""),
    auto_index: bool = Form(False),
    language: str = Form("zh"),
    user_id: str = Depends(get_current_user),
):
    """转录音频文件并可选自动入库"""
    try:
        return await transcribe_audio_response(
            file=file,
            project_id=project_id,
            auto_index=auto_index,
            language=language,
            user_id=user_id,
        )
    except APIException:
        raise
    except Exception as exc:
        raise handle_rag_error(f"音频转录失败: {str(exc)}", exc)


@router.post("/video-analyze")
async def analyze_video_endpoint(
    file: UploadFile = File(...),
    project_id: str = Form(""),
    auto_index: bool = Form(False),
    user_id: str = Depends(get_current_user),
):
    """分析视频文件并可选自动入库"""
    try:
        return await analyze_video_response(
            file=file,
            project_id=project_id,
            auto_index=auto_index,
            user_id=user_id,
        )
    except APIException:
        raise
    except Exception as exc:
        raise handle_rag_error(f"视频分析失败: {str(exc)}", exc)
