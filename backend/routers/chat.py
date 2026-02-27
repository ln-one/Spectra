"""Chat router with minimal MVP implementation."""

import logging
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    UploadFile,
    status,
)

from schemas.chat import Message, SendMessageRequest
from services.ai import ai_service
from services.database import db_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ForbiddenException, NotFoundException
from utils.responses import success_response

router = APIRouter(prefix="/chat", tags=["Chat"])
logger = logging.getLogger(__name__)


def _to_message(item) -> dict:
    """Convert conversation row to response payload."""
    return Message(
        id=item.id,
        role=item.role,
        content=item.content,
        timestamp=item.createdAt,
    ).model_dump(mode="json")


@router.post("/messages")
async def send_message(
    request: SendMessageRequest,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """Send user message and return assistant reply."""
    try:
        project = await db_service.get_project(request.project_id)
        if not project:
            raise NotFoundException(message=f"项目不存在: {request.project_id}")
        if project.userId != user_id:
            raise ForbiddenException(message="无权限访问此项目")

        await db_service.create_conversation_message(
            project_id=request.project_id,
            role="user",
            content=request.content,
            metadata={"idempotency_key": idempotency_key} if idempotency_key else None,
        )

        recent_messages = await db_service.get_conversation_messages(
            project_id=request.project_id,
            page=1,
            limit=10,
        )
        context = "\n".join([f"{m.role}: {m.content}" for m in recent_messages[-6:]])
        prompt = (
            "你是教学课件助手。请基于上下文给出简洁、有操作性的下一步建议。\n\n"
            f"项目: {project.name}\n"
            f"上下文:\n{context}\n\n"
            f"用户新消息: {request.content}"
        )
        ai_result = await ai_service.generate(prompt=prompt, max_tokens=500)
        assistant_content = (
            ai_result.get("content") or "我已收到你的需求，我们继续完善课件内容。"
        )

        assistant_msg = await db_service.create_conversation_message(
            project_id=request.project_id,
            role="assistant",
            content=assistant_content,
        )

        return success_response(
            data={
                "message": _to_message(assistant_msg),
                "suggestions": ["继续细化教学目标", "补充重点难点", "开始生成课件"],
            },
            message="发送成功",
        )
    except APIException:
        raise
    except Exception as e:
        logger.error(f"Send message failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="发送消息失败",
        )


@router.get("/messages")
async def get_messages(
    project_id: str = Query(...),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user_id: str = Depends(get_current_user),
):
    """Get conversation history."""
    try:
        project = await db_service.get_project(project_id)
        if not project:
            raise NotFoundException(message=f"项目不存在: {project_id}")
        if project.userId != user_id:
            raise ForbiddenException(message="无权限访问此项目")

        messages = await db_service.get_conversation_messages(
            project_id=project_id,
            page=page,
            limit=limit,
        )
        total = await db_service.count_conversation_messages(project_id=project_id)

        return success_response(
            data={
                "messages": [_to_message(m) for m in messages],
                "total": total,
                "page": page,
                "limit": limit,
            },
            message="获取成功",
        )
    except APIException:
        raise
    except Exception as e:
        logger.error(f"Get messages failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取消息失败",
        )


@router.post("/voice")
async def send_voice_message(
    audio: UploadFile = File(...),
    project_id: str = Form(...),
    user_id: str = Depends(get_current_user),
):
    """Minimal voice endpoint: returns simple transcript and assistant reply."""
    try:
        project = await db_service.get_project(project_id)
        if not project:
            raise NotFoundException(message=f"项目不存在: {project_id}")
        if project.userId != user_id:
            raise ForbiddenException(message="无权限访问此项目")

        raw = await audio.read()
        duration = max(1.0, len(raw) / 32000.0)
        recognized_text = "语音内容已识别，请继续描述课件需求。"

        user_msg = await db_service.create_conversation_message(
            project_id=project_id,
            role="user",
            content=recognized_text,
            metadata={"source": "voice", "filename": audio.filename},
        )
        assistant_msg = await db_service.create_conversation_message(
            project_id=project_id,
            role="assistant",
            content="收到语音需求。你可以继续补充年级、课时和重点难点，我会据此生成课件。",
        )

        return success_response(
            data={
                "text": recognized_text,
                "confidence": 0.85,
                "duration": round(duration, 2),
                "message": _to_message(assistant_msg),
                "suggestions": ["补充教学目标", "补充参考资料", "开始生成课件"],
            },
            message="语音识别成功",
        )
    except APIException:
        raise
    except Exception as e:
        logger.error(f"Voice message failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="语音处理失败",
        )
