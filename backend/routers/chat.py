import hashlib
import json
import logging
import os
import re
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
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from schemas.chat import Message, SendMessageRequest
from services import db_service
from services.ai import ai_service
from services.model_router import ModelRouteTask
from services.prompt_service import contains_mechanical_option_pattern, prompt_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ErrorCode, ForbiddenException
from utils.responses import error_response, success_response

router = APIRouter(prefix="/chat", tags=["Chat"])
logger = logging.getLogger(__name__)

# Prompt 可观测版本号
PROMPT_TEMPLATE_VERSION = "v1.0"
FEW_SHOT_VERSION = "v1.0"


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
    content = conv.content
    if getattr(conv, "role", None) == "assistant":
        content = _strip_cite_tags(content)

    try:
        return Message(
            id=conv.id,
            role=conv.role,
            content=content,
            timestamp=conv.createdAt,
            citations=citations,
        ).model_dump(mode="json")
    except Exception:
        # Backward compatible fallback for malformed historical metadata.
        return Message(
            id=conv.id,
            role=conv.role,
            content=content,
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


def _build_cite_tag(item: dict) -> str:
    """Build a compact cite tag from a structured citation payload."""
    chunk_id = item.get("chunk_id")
    if not chunk_id:
        return ""
    filename = item.get("filename")
    attrs = [f'chunk_id="{chunk_id}"']
    if filename:
        attrs.append(f'filename="{filename}"')
    return "<cite " + " ".join(attrs) + "></cite>"


def _normalize_markdown_paragraphs(content: str) -> str:
    """Ensure long single-block response is split into markdown paragraphs."""
    if not content or "\n\n" in content:
        return content
    sentences = [
        s.strip() for s in re.split(r"(?<=[。！？!?])\s*", content) if s.strip()
    ]
    if len(sentences) < 3:
        return content
    paragraphs: list[str] = []
    for i in range(0, len(sentences), 2):
        chunk = " ".join(sentences[i : i + 2]).strip()
        if chunk:
            paragraphs.append(chunk)
    if len(paragraphs) <= 1:
        return content
    return "\n\n".join(paragraphs)


def _append_citation_markers(content: str, citations: list[dict]) -> str:
    """Normalize citation markers to <cite ...></cite> protocol."""
    if not citations:
        return content

    # Backward-compatible conversion: [1] -> <cite chunk_id="..."></cite>
    def _replace_numeric_marker(match: re.Match) -> str:
        idx = int(match.group(1)) - 1
        if idx < 0 or idx >= len(citations):
            return match.group(0)
        cite_tag = _build_cite_tag(citations[idx])
        return cite_tag or match.group(0)

    converted = re.sub(r"\[(\d+)\]", _replace_numeric_marker, content)
    if "<cite " in converted:
        return converted

    # If model omitted inline markers, attach first cite tag to the first paragraph.
    first_tag = _build_cite_tag(citations[0])
    if not first_tag:
        return converted
    lines = converted.splitlines()
    if not lines:
        return converted
    for idx, line in enumerate(lines):
        stripped = line.strip()
        if stripped and not stripped.startswith(("#", "-", "*", ">")):
            lines[idx] = f"{line.rstrip()} {first_tag}"
            return "\n".join(lines)

    return f"{converted.rstrip()} {first_tag}"


def _extract_cited_chunk_ids(content: str) -> list[str]:
    """Extract chunk ids from inline <cite ...></cite> tags in content order."""
    if not content:
        return []
    ids: list[str] = []
    for match in re.finditer(
        r'<cite\s+[^>]*chunk_id="([^"]+)"[^>]*>(?:\s*</cite>)?', content
    ):
        chunk_id = (match.group(1) or "").strip()
        if chunk_id:
            ids.append(chunk_id)
    return ids


def _sanitize_cite_tags(content: str, citations: list[dict]) -> str:
    """Drop cite tags that cannot be mapped to structured citations."""
    if not content:
        return content
    valid_ids = {
        str(item.get("chunk_id")).strip()
        for item in citations
        if isinstance(item, dict) and item.get("chunk_id")
    }
    if not valid_ids:
        return re.sub(r"<cite\b[^>]*>(?:\s*</cite>)?", "", content)

    def _replace_invalid_tag(match: re.Match) -> str:
        tag = match.group(0)
        chunk_id_match = re.search(r'chunk_id="([^"]+)"', tag)
        if not chunk_id_match:
            return ""
        chunk_id = chunk_id_match.group(1).strip()
        return tag if chunk_id in valid_ids else ""

    return re.sub(r"<cite\b[^>]*>(?:\s*</cite>)?", _replace_invalid_tag, content)


def _align_citations_with_content(content: str, citations: list[dict]) -> list[dict]:
    """Keep citations[] aligned with inline cite tags in content."""
    if not citations:
        return []
    chunk_order = _extract_cited_chunk_ids(content)
    if not chunk_order:
        return []

    by_chunk_id: dict[str, dict] = {}
    for item in citations:
        if not isinstance(item, dict):
            continue
        chunk_id = item.get("chunk_id")
        if not chunk_id:
            continue
        key = str(chunk_id).strip()
        if key and key not in by_chunk_id:
            by_chunk_id[key] = item

    ordered: list[dict] = []
    seen: set[str] = set()
    for chunk_id in chunk_order:
        if chunk_id in seen:
            continue
        seen.add(chunk_id)
        item = by_chunk_id.get(chunk_id)
        if item:
            ordered.append(item)
    return ordered


def _strip_cite_tags(content: str) -> str:
    """Remove inline <cite ...></cite> tags for display-safe message content."""
    if not content:
        return content
    return re.sub(r"<cite\s+[^>]*>(?:\s*</cite>)?", "", content)


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
        rag_results = []
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
                        selected_files_hint = "已选资料（含解析状态）： " + "，".join(
                            names
                        )
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
                citations = [
                    {
                        "chunk_id": r.source.chunk_id,
                        "source_type": r.source.source_type,
                        "filename": r.source.filename,
                        "page_number": r.source.page_number,
                        "timestamp": getattr(r.source, "timestamp", None),
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
        history_payload = [
            {"role": msg.role, "content": msg.content} for msg in recent_messages[-6:]
        ]
        rag_payload = None
        if rag_results:
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

        message_hints = []
        if selected_files_hint:
            message_hints.append(selected_files_hint)
        if not rag_hit and session_id:
            message_hints.append("未命中项目资料，请优先提示用户补充可检索素材。")
        user_message_for_prompt = body.content
        if message_hints:
            user_message_for_prompt = f"{body.content}\n\n系统提示：\n" + "\n".join(
                message_hints
            )

        prompt = prompt_service.build_chat_response_prompt(
            user_message=user_message_for_prompt,
            intent="general_chat",
            session_id=session_id,
            rag_context=rag_payload,
            conversation_history=history_payload,
        )
        prompt = f"项目：{project.name}\n{prompt}"

        # 生成 request_id 用于追踪
        request_id = str(uuid4())
        prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:16]
        route_info = {}
        selected_model = "unknown"
        provider_model = "unknown"
        fallback_triggered = False
        mechanical_pattern_hit = False
        latency_ms = None
        response_hash = ""

        try:
            ai_result = await ai_service.generate(
                prompt=prompt,
                route_task=ModelRouteTask.CHAT_RESPONSE.value,
                has_rag_context=rag_hit,
                max_tokens=500,
            )
            assistant_content = (
                ai_result.get("content") or "我已收到你的需求，我们继续完善课件内容。"
            )

            # 收集路由决策信息
            route_info = ai_result.get("route") or {}
            provider_model = ai_result.get("model", "unknown")
            selected_model = route_info.get("selected_model", provider_model)
            fallback_triggered = ai_result.get("fallback_triggered", False)
            latency_ms = ai_result.get("latency_ms")
            response_hash = hashlib.sha256(
                assistant_content.encode("utf-8")
            ).hexdigest()[:16]
            mechanical_pattern_hit = contains_mechanical_option_pattern(
                assistant_content
            )

            if mechanical_pattern_hit:
                logger.warning(
                    "Mechanical option phrasing detected in assistant response; "
                    "attempting soft rewrite"
                )
                rewrite_prompt = (
                    "请将下面这段回复改写为自然、温和的助教口吻，"
                    "保留原始信息，不要使用 A/B/C 选项式表达，"
                    "给出 1-2 个具体可执行教学切入点：\n\n"
                    f"{assistant_content}"
                )
                rewrite_result = await ai_service.generate(
                    prompt=rewrite_prompt,
                    route_task=ModelRouteTask.SHORT_TEXT_POLISH.value,
                    max_tokens=500,
                )
                rewritten_content = (rewrite_result.get("content") or "").strip()
                if rewritten_content:
                    assistant_content = rewritten_content
            assistant_content = _normalize_markdown_paragraphs(assistant_content)
        except Exception as ai_exc:
            logger.error("AI generation failed in chat: %s", ai_exc, exc_info=True)
            if os.getenv("DEBUG", "false").lower() in {"1", "true", "yes", "on"}:
                logger.warning("[DEV] AI error detail: %s", ai_exc)
            assistant_content = "AI 服务暂时不可用，我已收到你的需求。你可以先补充更多细节，我会在恢复后继续帮你完善。"

        # 将 citations 存入 metadata
        response_hash = (
            response_hash
            or hashlib.sha256(assistant_content.encode("utf-8")).hexdigest()[:16]
        )
        assistant_content = _sanitize_cite_tags(assistant_content, citations)
        assistant_content = _append_citation_markers(assistant_content, citations)
        citations = _align_citations_with_content(assistant_content, citations)

        # 构建可观测 metadata
        observability_metadata = {
            "request_id": request_id,
            "prompt_template_version": PROMPT_TEMPLATE_VERSION,
            "few_shot_version": FEW_SHOT_VERSION,
            "route_task": ModelRouteTask.CHAT_RESPONSE.value,
            "selected_model": selected_model,
            "provider_model": provider_model,
            "has_rag_context": rag_hit,
            "prompt_hash": prompt_hash,
            "response_hash": response_hash,
            "mechanical_pattern_hit": mechanical_pattern_hit,
            "fallback_triggered": fallback_triggered,
            "latency_ms": latency_ms,
        }
        # 添加路由决策信息
        if route_info:
            observability_metadata["route_decision"] = route_info

        # 合并所有 metadata
        full_metadata = {
            "citations": citations,
            "rag_hit": rag_hit,
            "session_id": session_id,
            **observability_metadata,
        }

        assistant_msg = await db_service.create_conversation_message(
            project_id=body.project_id,
            role="assistant",
            content=assistant_content,
            metadata=(
                full_metadata if (citations or session_id) else observability_metadata
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
                "observability": observability_metadata,  # 添加可观测字段
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
                "session_id": session_id,
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
