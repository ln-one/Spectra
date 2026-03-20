from typing import Optional
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Query, status

from schemas.chat import SendMessageRequest
from services.database import db_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException
from utils.responses import success_response

from .runtime import process_chat_message
from .shared import (
    logger,
    router,
    to_message,
    verify_project_ownership,
)


@router.post("/messages")
async def send_message(
    body: SendMessageRequest,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    return await process_chat_message(
        body,
        user_id=user_id,
        idempotency_key=idempotency_key,
    )


@router.get("/messages")
async def get_messages(
    project_id: str = Query(...),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    session_id: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user),
):
    try:
        await verify_project_ownership(project_id, user_id)
        if not session_id:
            return success_response(
                data={
                    "session_id": None,
                    "messages": [],
                    "total": 0,
                    "page": page,
                    "limit": limit,
                },
                message="当前未绑定会话，返回空对话历史",
            )
        messages, total = await db_service.get_conversations_paginated(
            project_id=project_id,
            page=page,
            limit=limit,
            session_id=session_id,
        )
        return success_response(
            data={
                "session_id": session_id,
                "messages": [to_message(message) for message in messages],
                "total": total,
                "page": page,
                "limit": limit,
            },
            message="获取对话历史成功",
        )
    except APIException:
        raise
    except Exception as exc:
        logger.error("Get messages failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取消息失败",
        )
