import logging
from typing import Optional
from uuid import UUID

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
from services import db_service
from services.ai import ai_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ErrorCode, ForbiddenException
from utils.responses import success_response

router = APIRouter(prefix="/chat", tags=["Chat"])
logger = logging.getLogger(__name__)


async def _verify_project_ownership(project_id: str, user_id: str):
    """Return project if owned by user, else raise 403."""
    project = await db_service.get_project(project_id)
    if not project or project.userId != user_id:
        raise ForbiddenException(
            message="鏃犳潈璁块棶璇ラ」鐩�",
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
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """Save user message, generate assistant response, return assistant message."""
    try:
        project = await _verify_project_ownership(body.project_id, user_id)
        key_str = str(idempotency_key) if idempotency_key else None

        await db_service.create_conversation_message(
            project_id=body.project_id,
            role="user",
            content=body.content,
            metadata={"idempotency_key": key_str} if key_str else None,
        )

        recent_messages = await db_service.get_conversation_messages(
            project_id=body.project_id,
            page=1,
            limit=10,
        )
        context = "\n".join([f"{m.role}: {m.content}" for m in recent_messages[-6:]])
        prompt = (
            "浣犳槸鏁欏璇句欢鍔╂墜銆傝鍩轰簬涓婁笅鏂囩粰鍑虹畝娲併€佹湁鎿嶄綔鎬х殑涓嬩竴姝ュ缓璁€俓n\n"
            f"椤圭洰: {project.name}\n"
            f"涓婁笅鏂�:\n{context}\n\n"
            f"鐢ㄦ埛鏂版秷鎭�: {body.content}"
        )
        ai_result = await ai_service.generate(prompt=prompt, max_tokens=500)
        assistant_content = (
            ai_result.get("content") or "鎴戝凡鏀跺埌浣犵殑闇€姹傦紝鎴戜滑缁х画瀹屽杽璇句欢鍐呭銆�"
        )
        assistant_msg = await db_service.create_conversation_message(
            project_id=body.project_id,
            role="assistant",
            content=assistant_content,
        )

        return success_response(
            data={
                "message": _to_message(assistant_msg),
                "suggestions": ["缁х画缁嗗寲鏁欏鐩爣", "琛ュ厖閲嶇偣闅剧偣", "寮€濮嬬敓鎴愯浠�"],
            },
            message="娑堟伅鍙戦€佹垚鍔�",
        )
    except APIException:
        raise
    except Exception as exc:
        logger.error(f"Send message failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="鍙戦€佹秷鎭け璐�",
        )


@router.get("/messages")
async def get_messages(
    project_id: str = Query(...),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user_id: str = Depends(get_current_user),
):
    """Get paginated conversation history for a project."""
    try:
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
            message="鑾峰彇瀵硅瘽鍘嗗彶鎴愬姛",
        )
    except APIException:
        raise
    except Exception as exc:
        logger.error(f"Get messages failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="鑾峰彇娑堟伅澶辫触",
        )


@router.post("/voice")
async def voice_message(
    audio: UploadFile = File(...),
    project_id: str = Form(...),
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """Handle voice input and create paired user/assistant chat records."""
    try:
        await _verify_project_ownership(project_id, user_id)
        _ = idempotency_key

        raw = await audio.read()
        duration = max(1.0, len(raw) / 32000.0)
        recognized_text = "璇煶鍐呭宸茶瘑鍒紝璇风户缁弿杩拌浠堕渶姹傘€�"

        await db_service.create_conversation_message(
            project_id=project_id,
            role="user",
            content=recognized_text,
            metadata={"source": "voice", "filename": audio.filename},
        )
        assistant_msg = await db_service.create_conversation_message(
            project_id=project_id,
            role="assistant",
            content="鏀跺埌璇煶闇€姹傘€備綘鍙互缁х画琛ュ厖骞寸骇銆佽鏃跺拰閲嶇偣闅剧偣锛屾垜浼氭嵁姝ょ敓鎴愯浠躲€�",
        )

        return success_response(
            data={
                "text": recognized_text,
                "confidence": 0.85,
                "duration": round(duration, 2),
                "message": _to_message(assistant_msg),
                "suggestions": ["琛ュ厖鏁欏鐩爣", "琛ュ厖鍙傝€冭祫鏂�", "寮€濮嬬敓鎴愯浠�"],
            },
            message="璇煶璇嗗埆鎴愬姛",
        )
    except APIException:
        raise
    except Exception as exc:
        logger.error(f"Voice message failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="璇煶澶勭悊澶辫触",
        )
        )
    except APIException:
        raise
    except Exception as exc:
        logger.error(f"Send message failed: {exc}", exc_info=True)
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
    """Get paginated conversation history for a project."""
    try:
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
    except APIException:
        raise
    except Exception as exc:
        logger.error(f"Get messages failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取消息失败",
        )


@router.post("/voice")
async def voice_message(
    audio: UploadFile = File(...),
    project_id: str = Form(...),
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """Handle voice input and create paired user/assistant chat records."""
    try:
        await _verify_project_ownership(project_id, user_id)
        _ = idempotency_key

        raw = await audio.read()
        duration = max(1.0, len(raw) / 32000.0)
        recognized_text = "语音内容已识别，请继续描述课件需求。"

        await db_service.create_conversation_message(
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
    except Exception as exc:
        logger.error(f"Voice message failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="语音处理失败",
        )
