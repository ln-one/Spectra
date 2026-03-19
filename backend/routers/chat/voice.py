import time
from pathlib import Path
from typing import Optional
from uuid import UUID, uuid4

from fastapi import Depends, File, Form, Header, HTTPException, UploadFile, status
from fastapi.encoders import jsonable_encoder

from schemas.chat import ChatRouteTask
from services.database import db_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException
from utils.responses import success_response

from .observability import build_observability_metadata
from .shared import (
    dump_capability_status,
    logger,
    router,
    to_message,
    verify_project_ownership,
)


@router.post("/voice")
async def voice_message(
    audio: UploadFile = File(...),
    project_id: str = Form(...),
    session_id: Optional[str] = Form(None),
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    try:
        await verify_project_ownership(project_id, user_id)
        key_str = str(idempotency_key) if idempotency_key else None
        cache_key = (
            f"chat:voice:{user_id}:{project_id}:{session_id}:{key_str}"
            if key_str
            else None
        )
        if cache_key:
            cached_response = await db_service.get_idempotency_response(cache_key)
            if cached_response:
                return cached_response

        import tempfile

        from services.media.audio import transcribe_audio

        with tempfile.NamedTemporaryFile(
            delete=False, suffix=Path(audio.filename or "audio.wav").suffix
        ) as tmp_file:
            content = await audio.read()
            tmp_file.write(content)
            tmp_path = tmp_file.name
        estimated_duration = max(1.0, len(content) / 32000.0)

        start_at = time.perf_counter()
        recognized_text, confidence, duration, capability_status = transcribe_audio(
            tmp_path
        )
        latency_ms = round((time.perf_counter() - start_at) * 1000, 2)
        duration = duration if duration > 0 else estimated_duration
        capability_status_payload = dump_capability_status(capability_status)
        Path(tmp_path).unlink(missing_ok=True)

        if not recognized_text:
            recognized_text = (
                capability_status.user_message
                or "语音识别暂不可用，请改用文本输入或稍后重试。"
            )

        observability_metadata = build_observability_metadata(
            request_id=str(uuid4()),
            route_task=ChatRouteTask.SPEECH_RECOGNITION,
            selected_model=capability_status_payload.get("provider", "unknown"),
            has_rag_context=False,
            fallback_triggered=bool(
                capability_status_payload.get("fallback_used", False)
            ),
            latency_ms=latency_ms,
        )

        await db_service.create_conversation_message(
            project_id=project_id,
            role="user",
            content=recognized_text,
            metadata=(
                {
                    "source": "voice",
                    "filename": audio.filename,
                    "idempotency_key": key_str,
                    "capability_status": capability_status_payload,
                }
                if key_str
                else {
                    "source": "voice",
                    "filename": audio.filename,
                    "capability_status": capability_status_payload,
                }
            ),
            session_id=session_id,
        )
        assistant_msg = await db_service.create_conversation_message(
            project_id=project_id,
            role="assistant",
            content=(
                "收到语音需求。你可以继续补充年级、课时和重点难点，"
                "我会据此生成课件。"
            ),
            metadata={
                "citations": [],
                "rag_hit": False,
                "session_id": session_id,
                **observability_metadata,
            },
            session_id=session_id,
        )
        assistant_msg_dict = to_message(assistant_msg)
        assistant_msg_dict["citations"] = []

        response_payload = success_response(
            data={
                "session_id": session_id,
                "text": recognized_text,
                "confidence": confidence,
                "duration": round(duration, 2),
                "message": assistant_msg_dict,
                "rag_hit": False,
                "capability_status": capability_status_payload,
                "observability": observability_metadata,
                "suggestions": ["补充教学目标", "补充参考资料", "开始生成课件"],
            },
            message="语音识别成功",
        )
        if cache_key:
            await db_service.save_idempotency_response(
                cache_key,
                jsonable_encoder(response_payload),
            )
        return response_payload
    except APIException:
        raise
    except Exception as exc:
        logger.error("Voice message failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="语音处理失败",
        )
