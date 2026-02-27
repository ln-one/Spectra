import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from schemas.chat import Message, SendMessageRequest
from services import db_service
from utils.dependencies import get_current_user
from utils.exceptions import ErrorCode, ForbiddenException
from utils.responses import success_response

router = APIRouter(prefix="/chat", tags=["Chat"])
logger = logging.getLogger(__name__)


async def _verify_project_ownership(project_id: str, user_id: str):
    """Return project if owned by user, else raise 403."""
    project = await db_service.get_project(project_id)
    if not project or project.userId != user_id:
        raise ForbiddenException(
            message="无权访问该项目",
            error_code=ErrorCode.FORBIDDEN,
        )
    return project


def _to_message(conv) -> dict:
    """Convert Prisma Conversation record to API message payload."""
    return Message(
        id=conv.id,
        role=conv.role,
        content=conv.content,
        timestamp=conv.createdAt,
    ).model_dump(mode="json")


@router.post("/messages")
async def send_message(
    body: SendMessageRequest,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """Save user message and return stored message."""
    await _verify_project_ownership(body.project_id, user_id)

    conv = await db_service.create_conversation(
        project_id=body.project_id,
        role="user",
        content=body.content,
    )

    return success_response(
        data={"message": _to_message(conv), "suggestions": []},
        message="消息发送成功",
    )


@router.get("/messages")
async def get_messages(
    project_id: str = Query(...),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user_id: str = Depends(get_current_user),
):
    """Get paginated conversation history for a project."""
    await _verify_project_ownership(project_id, user_id)

    messages, total = await db_service.get_conversations_paginated(
        project_id=project_id,
        page=page,
        limit=limit,
    )

    return success_response(
        data={
            "messages": [_to_message(m) for m in messages],
            "total": total,
            "page": page,
            "limit": limit,
        },
        message="获取对话历史成功",
    )


@router.post("/voice", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def voice_message(
    user_id: str = Depends(get_current_user),
):
    """Voice input is not implemented in current scope."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="语音消息功能尚未实现",
    )
