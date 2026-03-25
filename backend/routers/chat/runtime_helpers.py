import asyncio
import os
import time

from schemas.chat import SendMessageRequest
from services.ai import ai_service
from services.ai.model_resolution import _resolve_model_name
from services.ai.model_router import ModelRouteTask
from services.chat import resolve_effective_rag_source_ids
from services.database import db_service
from services.prompt_service import contains_mechanical_option_pattern, prompt_service

from .message_flow import build_history_payload, load_rag_context
from .refine_context import build_card_context_hint
from .shared import logger, normalize_markdown_paragraphs


async def load_chat_context(
    *,
    body: SendMessageRequest,
    session_id: str,
) -> tuple[tuple, list[dict], dict[str, float]]:
    effective_rag_source_ids = resolve_effective_rag_source_ids(
        rag_source_ids=body.rag_source_ids,
        metadata=body.metadata,
    )

    async def _timed_rag_context():
        started_at = time.perf_counter()
        result = await load_rag_context(
            project_id=body.project_id,
            query=body.content,
            session_id=session_id,
            rag_source_ids=effective_rag_source_ids,
        )
        return result, round((time.perf_counter() - started_at) * 1000, 2)

    async def _timed_history_payload():
        started_at = time.perf_counter()
        result = await build_history_payload(
            project_id=body.project_id,
            session_id=session_id,
        )
        return result, round((time.perf_counter() - started_at) * 1000, 2)

    (rag_result, rag_ms), (history_payload, history_ms) = await asyncio.gather(
        _timed_rag_context(),
        _timed_history_payload(),
    )
    return rag_result, history_payload, {"rag_ms": rag_ms, "history_ms": history_ms}


def build_chat_prompt(
    *,
    body: SendMessageRequest,
    project_name: str,
    session_id: str,
    rag_hit: bool,
    selected_files_hint: str,
    rag_payload,
    history_payload: list[dict],
) -> str:
    message_hints = []
    if selected_files_hint:
        message_hints.append(selected_files_hint)
    if not rag_hit and session_id:
        message_hints.append(
            "RAG miss in this round. Do NOT claim the user has no uploaded files. "
            "Provide best-effort guidance and ask for target file name or chapter."
        )
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
    return f"项目：{project_name}\n{prompt}"


async def generate_assistant_reply(
    *,
    prompt: str,
    rag_hit: bool,
) -> tuple[str, dict, dict[str, float]]:
    route_info = {}
    attempted_route = ai_service.model_router.route(
        ModelRouteTask.CHAT_RESPONSE.value,
        prompt=prompt,
        has_rag_context=rag_hit,
    )
    selected_model = attempted_route.selected_model
    provider_model = _resolve_model_name(selected_model)
    fallback_triggered = False
    mechanical_pattern_hit = False
    latency_ms = None
    assistant_digest = ""
    stage_timings_ms: dict[str, float] = {}

    try:
        stage_started = time.perf_counter()
        ai_result = await ai_service.generate(
            prompt=prompt,
            route_task=ModelRouteTask.CHAT_RESPONSE,
            has_rag_context=rag_hit,
            max_tokens=500,
        )
        stage_timings_ms["ai_generate_ms"] = round(
            (time.perf_counter() - stage_started) * 1000, 2
        )
        assistant_content = (
            ai_result.get("content") or "我已收到你的需求，我们继续完善课件内容。"
        )
        route_info = ai_result.get("route") or {}
        provider_model = ai_result.get("model", "unknown")
        selected_model = route_info.get("selected_model", provider_model)
        fallback_triggered = ai_result.get("fallback_triggered", False)
        latency_ms = ai_result.get("latency_ms")
        mechanical_pattern_hit = contains_mechanical_option_pattern(assistant_content)

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
            stage_started = time.perf_counter()
            rewrite_result = await ai_service.generate(
                prompt=rewrite_prompt,
                route_task=ModelRouteTask.SHORT_TEXT_POLISH,
                max_tokens=500,
            )
            stage_timings_ms["ai_rewrite_ms"] = round(
                (time.perf_counter() - stage_started) * 1000, 2
            )
            rewritten_content = (rewrite_result.get("content") or "").strip()
            if rewritten_content:
                assistant_content = rewritten_content
        assistant_content = normalize_markdown_paragraphs(assistant_content)
    except Exception as ai_exc:
        logger.error("AI generation failed in chat: %s", ai_exc, exc_info=True)
        if os.getenv("DEBUG", "false").lower() in {"1", "true", "yes", "on"}:
            logger.warning("[DEV] AI error detail: %s", ai_exc)
        if isinstance(ai_exc, TimeoutError):
            assistant_content = (
                "AI 回复这次有点慢，我已经收到你的需求。你可以先继续补充"
                "教学目标、重点难点或使用场景，我会在下一次响应里继续接上。"
            )
        else:
            assistant_content = (
                "AI 服务暂时不可用，我已收到你的需求。你可以先补充更多细节，"
                "我会在恢复后继续帮你完善。"
            )

    return (
        assistant_content,
        {
            "route_info": route_info,
            "selected_model": selected_model,
            "provider_model": provider_model,
            "fallback_triggered": fallback_triggered,
            "mechanical_pattern_hit": mechanical_pattern_hit,
            "latency_ms": latency_ms,
            "assistant_digest": assistant_digest,
        },
        stage_timings_ms,
    )


async def persist_assistant_message(
    *,
    body: SendMessageRequest,
    session_id: str,
    assistant_content: str,
    citations: list[dict],
    observability_metadata: dict,
) -> tuple[object, float]:
    full_metadata = {
        "citations": citations,
        "rag_hit": observability_metadata.get("rag_hit"),
        "session_id": session_id,
        **observability_metadata,
    }
    stage_started = time.perf_counter()
    assistant_msg = await db_service.create_conversation_message(
        project_id=body.project_id,
        role="assistant",
        content=assistant_content,
        metadata=(
            full_metadata if (citations or session_id) else observability_metadata
        ),
        session_id=session_id,
    )
    return assistant_msg, round((time.perf_counter() - stage_started) * 1000, 2)
