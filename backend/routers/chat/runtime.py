import os
from uuid import UUID, uuid4

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from schemas.chat import ChatRouteTask, SendMessageRequest
from services.ai import ai_service
from services.ai.model_router import ModelRouteTask
from services.database import db_service
from services.prompt_service import contains_mechanical_option_pattern, prompt_service
from utils.exceptions import APIException
from utils.responses import error_response, success_response

from .citation_utils import (
    align_citations_with_content,
    append_citation_markers,
    sanitize_cite_tags,
)
from .message_flow import build_history_payload, load_rag_context
from .observability import (
    FEW_SHOT_VERSION,
    PROMPT_TEMPLATE_VERSION,
    build_observability_metadata,
    prompt_hash,
    response_hash,
)
from .refine_context import build_card_context_hint
from .shared import (
    logger,
    normalize_markdown_paragraphs,
    to_message,
    verify_project_ownership,
)


async def process_chat_message(
    body: SendMessageRequest,
    *,
    user_id: str,
    idempotency_key: UUID | None = None,
):
    try:
        project = await verify_project_ownership(body.project_id, user_id)
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

        session_id = body.session_id
        user_message_metadata = {
            **(body.metadata or {}),
            **({"idempotency_key": key_str} if key_str else {}),
            **({"session_id": session_id} if session_id else {}),
        } or None
        await db_service.create_conversation_message(
            project_id=body.project_id,
            role="user",
            content=body.content,
            metadata=user_message_metadata,
            session_id=session_id,
        )

        rag_results, citations, rag_hit, selected_files_hint, rag_payload = (
            await load_rag_context(
                project_id=body.project_id,
                query=body.content,
                session_id=session_id,
                rag_source_ids=body.rag_source_ids,
            )
        )
        history_payload = await build_history_payload(
            project_id=body.project_id,
            session_id=session_id,
        )

        message_hints = []
        if selected_files_hint:
            message_hints.append(selected_files_hint)
        if not rag_hit and session_id:
            message_hints.append("未命中项目资料，请优先提示用户补充可检索素材。")
        card_context_hint = build_card_context_hint(body.metadata)
        if card_context_hint:
            message_hints.append(card_context_hint)
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

        request_id = str(uuid4())
        prompt_digest = prompt_hash(prompt)
        route_info = {}
        selected_model = "unknown"
        provider_model = "unknown"
        fallback_triggered = False
        mechanical_pattern_hit = False
        latency_ms = None
        assistant_digest = ""

        try:
            ai_result = await ai_service.generate(
                prompt=prompt,
                route_task=ModelRouteTask.CHAT_RESPONSE,
                has_rag_context=rag_hit,
                max_tokens=500,
            )
            assistant_content = (
                ai_result.get("content") or "我已收到你的需求，我们继续完善课件内容。"
            )
            route_info = ai_result.get("route") or {}
            provider_model = ai_result.get("model", "unknown")
            selected_model = route_info.get("selected_model", provider_model)
            fallback_triggered = ai_result.get("fallback_triggered", False)
            latency_ms = ai_result.get("latency_ms")
            assistant_digest = response_hash(assistant_content)
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
                    route_task=ModelRouteTask.SHORT_TEXT_POLISH,
                    max_tokens=500,
                )
                rewritten_content = (rewrite_result.get("content") or "").strip()
                if rewritten_content:
                    assistant_content = rewritten_content
            assistant_content = normalize_markdown_paragraphs(assistant_content)
        except Exception as ai_exc:
            logger.error("AI generation failed in chat: %s", ai_exc, exc_info=True)
            if os.getenv("DEBUG", "false").lower() in {"1", "true", "yes", "on"}:
                logger.warning("[DEV] AI error detail: %s", ai_exc)
            assistant_content = (
                "AI 服务暂时不可用，我已收到你的需求。你可以先补充更多细节，"
                "我会在恢复后继续帮你完善。"
            )

        assistant_digest = assistant_digest or response_hash(assistant_content)
        assistant_content = sanitize_cite_tags(assistant_content, citations)
        assistant_content = append_citation_markers(assistant_content, citations)
        citations = align_citations_with_content(assistant_content, citations)

        observability_metadata = build_observability_metadata(
            request_id=request_id,
            route_task=ChatRouteTask.CHAT_RESPONSE,
            selected_model=selected_model,
            provider_model=provider_model,
            has_rag_context=rag_hit,
            prompt_digest=prompt_digest,
            response_digest=assistant_digest,
            mechanical_pattern_hit=mechanical_pattern_hit,
            fallback_triggered=fallback_triggered,
            latency_ms=latency_ms,
            route_decision=route_info,
        )
        observability_metadata["prompt_template_version"] = PROMPT_TEMPLATE_VERSION
        observability_metadata["few_shot_version"] = FEW_SHOT_VERSION

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

        msg_dict = to_message(assistant_msg)
        msg_dict["citations"] = citations or []

        response_payload = success_response(
            data={
                "session_id": session_id,
                "message": msg_dict,
                "rag_hit": rag_hit,
                "suggestions": ["继续细化教学目标", "补充重点难点", "开始生成课件"],
                "observability": observability_metadata,
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
        logger.error("Send message failed: %s", exc, exc_info=True)
        debug_mode = os.getenv("DEBUG", "false").lower() == "true"
        details = None
        if debug_mode:
            details = {
                "exception_type": type(exc).__name__,
                "exception_message": str(exc),
            }
        return JSONResponse(
            status_code=500,
            content=error_response(
                code="INTERNAL_ERROR",
                message="发送消息失败",
                details=details,
            ),
        )
