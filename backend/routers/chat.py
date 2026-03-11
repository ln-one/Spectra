import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

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
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder

from schemas.chat import Message, SendMessageRequest
from services import db_service
from services.ai import ai_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ErrorCode, ForbiddenException
from utils.responses import error_response, success_response

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
    metadata = getattr(conv, "metadata", None)
    parsed_metadata = {}
    if isinstance(metadata, str):
        try:
            parsed_metadata = json.loads(metadata)
        except json.JSONDecodeError:
            parsed_metadata = {}
    elif isinstance(metadata, dict):
        parsed_metadata = metadata

    citations = parsed_metadata.get("citations")
    if not isinstance(citations, list):
        citations = None

    try:
        return Message(
            id=conv.id,
            role=conv.role,
            content=conv.content,
            timestamp=conv.createdAt,
            citations=citations,
        ).model_dump(mode="json")
    except Exception:
        # Backward compatible fallback for malformed historical metadata.
        return Message(
            id=conv.id,
            role=conv.role,
            content=conv.content,
            timestamp=conv.createdAt,
        ).model_dump(mode="json")


def _dump_capability_status(capability_status) -> dict:
    """Serialize capability status to JSON-safe dict with mock compatibility."""
    model_dump = getattr(capability_status, "model_dump", None)
    if callable(model_dump):
        try:
            return model_dump(mode="json")
        except TypeError:
            return model_dump()
    return jsonable_encoder(capability_status)


def _append_citation_markers(content: str, citations: list[dict]) -> str:
    """Append inline citation markers and a source list to the assistant content."""
    if not citations:
        return content
    if "来源：" in content or "來源：" in content:
        return content

    seen = set()
    ordered = []
    for item in citations:
        filename = item.get("filename")
        page_number = item.get("page_number")
        key = (filename, page_number)
        if key in seen:
            continue
        seen.add(key)
        ordered.append(item)

    if not ordered:
        return content

    lines = []
    for idx, item in enumerate(ordered, start=1):
        filename = item.get("filename") or "未知文件"
        page_number = item.get("page_number")
        page_suffix = f" (P{page_number})" if page_number else ""
        lines.append(f"[{idx}] {filename}{page_suffix}")

    return f"{content}\n\n来源：\n" + "\n".join(lines)


def _normalize_chapter_token(token: str) -> str:
    return token.replace(" ", "")


def _chinese_to_arabic(ch: str) -> Optional[int]:
    mapping = {
        "一": 1,
        "二": 2,
        "三": 3,
        "四": 4,
        "五": 5,
        "六": 6,
        "七": 7,
        "八": 8,
        "九": 9,
        "十": 10,
    }
    return mapping.get(ch)


def _extract_chapter_tokens(query: str) -> list[str]:
    tokens: list[str] = []
    if not query:
        return tokens
    # Match patterns like "第2章" or "第二章"
    import re

    for match in re.findall(r"第\\s*([0-9]+)\\s*章", query):
        tokens.append(f"第{match}章")

    for match in re.findall(r"第\\s*([一二三四五六七八九十])\\s*章", query):
        tokens.append(f"第{match}章")
        arabic = _chinese_to_arabic(match)
        if arabic is not None:
            tokens.append(f"第{arabic}章")

    # 去重保持顺序
    seen = set()
    ordered = []
    for t in tokens:
        t = _normalize_chapter_token(t)
        if t in seen:
            continue
        seen.add(t)
        ordered.append(t)
    return ordered


def _rerank_by_chapter(query: str, rag_results: list):
    tokens = _extract_chapter_tokens(query)
    if not tokens or not rag_results:
        return rag_results

    scored = []
    for r in rag_results:
        content = str(getattr(r, "content", "") or "")
        filename = str(getattr(getattr(r, "source", None), "filename", "") or "")
        match_score = 0
        for t in tokens:
            if t in content:
                match_score += 2
            if t in filename:
                match_score += 1
        scored.append((match_score, r))

    has_match = any(score > 0 for score, _ in scored)
    if not has_match:
        return rag_results

    scored.sort(key=lambda x: (x[0], getattr(x[1], "score", 0)), reverse=True)
    return [r for _, r in scored]


@router.post("/messages")
async def send_message(
    body: SendMessageRequest,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """Save user message, generate assistant response, return assistant message.

    C5: 当 session_id 存在时，RAG 检索按 project_id + session_id 过滤，
    实现同 project 多 session 资料不互串。
    """
    try:
        project = await _verify_project_ownership(body.project_id, user_id)
        key_str = str(idempotency_key) if idempotency_key else None
        cache_key = (
            f"chat:messages:{user_id}:{body.project_id}:{body.session_id}:{key_str}"
            if key_str
            else None
        )
        if cache_key:
            cached_response = await db_service.get_idempotency_response(cache_key)
            if cached_response:
                return cached_response

        session_id = body.session_id  # 可为 None（兼容旧调用）

        await db_service.create_conversation_message(
            project_id=body.project_id,
            role="user",
            content=body.content,
            metadata={
                **({"idempotency_key": key_str} if key_str else {}),
                **({"session_id": session_id} if session_id else {}),
            }
            or None,
            session_id=session_id,
        )

        # C5: RAG 检索（按 project_id + session_id 隔离）
        rag_context = ""
        citations = []
        rag_hit = False
        selected_files_hint = ""
        try:
            from services.rag_service import rag_service as _rag

            rag_filters = None
            if body.rag_source_ids:
                rag_filters = {"file_ids": body.rag_source_ids}
                try:
                    selected_uploads = await db_service.db.upload.find_many(
                        where={
                            "projectId": body.project_id,
                            "id": {"in": body.rag_source_ids},
                        },
                        select={"filename": True, "status": True},
                    )
                    if selected_uploads:
                        names = [f"{u.filename}({u.status})" for u in selected_uploads]
                        selected_files_hint = "已选资料（含解析状态）： " + "，".join(names)
                except Exception as file_err:
                    logger.warning("Failed to load selected uploads: %s", file_err)

            rag_results = await _rag.search(
                project_id=body.project_id,
                query=body.content,
                top_k=5,
                score_threshold=0.3,
                session_id=session_id,
                filters=rag_filters,
            )
            rag_results = _rerank_by_chapter(body.content, rag_results)
            if rag_results:
                rag_hit = True
                rag_context = "\n\n".join(
                    [
                        f"[资料片段 {i+1}]: {r.content}"
                        for i, r in enumerate(rag_results)
                    ]
                )
                citations = [
                    {
                        "chunk_id": r.source.chunk_id,
                        "source_type": r.source.source_type,
                        "filename": r.source.filename,
                        "page_number": r.source.page_number,
                        "score": r.score,
                    }
                    for r in rag_results
                ]
        except Exception as rag_exc:
            logger.warning("RAG search failed, continuing without context: %s", rag_exc)

        recent_messages = await db_service.get_recent_conversation_messages(
            project_id=body.project_id,
            limit=10,
            session_id=session_id,
        )
        context = "\n".join([f"{m.role}: {m.content}" for m in recent_messages[-6:]])

        # 构造包含 RAG 资料的 prompt
        rag_section = (
            f"\n\n已上传的参考资料片段（优先基于此回答）：\n{rag_context}"
            if rag_context
            else ""
        )
        no_rag_hint = (
            "\n\n（未在已上传资料中找到相关内容，将基于通用知识回答。）"
            if not rag_hit and session_id
            else ""
        )
        project_line = f"项目: {project.name}"
        if selected_files_hint:
            project_line = f"{project_line}\n{selected_files_hint}"

        prompt = (
            "你是教学课件助手。请基于上下文给出简洁、有操作性的下一步建议。"
            "如果引用资料，请在相关句末用 [1][2] 这样的序号标注。\n\n"
            f"{project_line}"
            f"{rag_section}{no_rag_hint}\n\n"
            f"上下文:\n{context}\n\n"
            f"用户新消息: {body.content}"
        )
        try:
            ai_result = await ai_service.generate(prompt=prompt, max_tokens=500)
            assistant_content = (
                ai_result.get("content") or "我已收到你的需求，我们继续完善课件内容。"
            )
        except Exception as ai_exc:
            logger.error("AI generation failed in chat: %s", ai_exc, exc_info=True)
            if os.getenv("DEBUG", "false").lower() in {"1", "true", "yes", "on"}:
                logger.warning("[DEV] AI error detail: %s", ai_exc)
            assistant_content = (
                "AI 服务暂时不可用，我已收到你的需求。你可以先补充更多细节，我会在恢复后继续帮你完善。"
            )

        # 将 citations 存入 metadata
        assistant_content = _append_citation_markers(assistant_content, citations)
        assistant_msg = await db_service.create_conversation_message(
            project_id=body.project_id,
            role="assistant",
            content=assistant_content,
            metadata=(
                {"citations": citations, "rag_hit": rag_hit, "session_id": session_id}
                if (citations or session_id)
                else None
            ),
            session_id=session_id,
        )

        # 构建回复 message（含 citations 字段）
        msg_dict = _to_message(assistant_msg)
        if citations:
            msg_dict["citations"] = citations

        response_payload = success_response(
            data={
                "session_id": session_id,
                "message": msg_dict,
                "rag_hit": rag_hit,
                "suggestions": ["继续细化教学目标", "补充重点难点", "开始生成课件"],
            },
            message="消息发送成功",
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
        logger.error(f"Send message failed: {exc}", exc_info=True)
        debug_mode = os.getenv("DEBUG", "false").lower() == "true"
        details = None
        if debug_mode:
            details = {
                "exception_type": type(exc).__name__,
                "exception_message": str(exc),
            }

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response(
                code="INTERNAL_ERROR",
                message="发送消息失败",
                details=details,
            ),
        )


@router.get("/messages")
async def get_messages(
    project_id: str = Query(...),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    session_id: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user),
):
    """Get paginated conversation history for a project."""
    try:
        await _verify_project_ownership(project_id, user_id)

        messages, total = await db_service.get_conversations_paginated(
            project_id=project_id,
            page=page,
            limit=limit,
            session_id=session_id,
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
    session_id: Optional[str] = Form(None),
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """Handle voice input and create paired user/assistant chat records."""
    try:
        await _verify_project_ownership(project_id, user_id)
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

        # 保存音频文件到临时位置
        import tempfile
        from pathlib import Path

        with tempfile.NamedTemporaryFile(
            delete=False, suffix=Path(audio.filename or "audio.wav").suffix
        ) as tmp_file:
            content = await audio.read()
            tmp_file.write(content)
            tmp_path = tmp_file.name
        estimated_duration = max(1.0, len(content) / 32000.0)

        # 调用音频服务进行识别
        from services.audio_service import transcribe_audio

        recognized_text, confidence, duration, capability_status = transcribe_audio(
            tmp_path
        )
        duration = duration if duration > 0 else estimated_duration

        # 清理临时文件
        Path(tmp_path).unlink(missing_ok=True)

        # 如果识别失败，使用可解释降级文案，避免误导为“已识别”
        if not recognized_text:
            recognized_text = (
                capability_status.user_message
                or "语音识别暂不可用，请改用文本输入或稍后重试。"
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
                    "capability_status": _dump_capability_status(capability_status),
                }
                if key_str
                else {
                    "source": "voice",
                    "filename": audio.filename,
                    "capability_status": _dump_capability_status(capability_status),
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
            session_id=session_id,
        )

        response_payload = success_response(
            data={
                "session_id": session_id,
                "text": recognized_text,
                "confidence": confidence,
                "duration": round(duration, 2),
                "message": _to_message(assistant_msg),
                "capability_status": _dump_capability_status(capability_status),
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
        logger.error(f"Voice message failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="语音处理失败",
        )
