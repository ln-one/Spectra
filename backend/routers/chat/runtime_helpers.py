import asyncio
import os
import time
from pathlib import Path

from schemas.chat import SendMessageRequest
from schemas.common import normalize_source_type
from services.ai import ai_service
from services.ai.model_resolution import _resolve_model_name
from services.ai.model_router import ModelRouteTask
from services.chat import resolve_effective_rag_source_ids
from services.database import db_service
from services.prompt_service import contains_mechanical_option_pattern, prompt_service

from .message_flow import build_history_payload, load_rag_context
from .refine_context import build_card_context_hint
from .shared import logger, normalize_markdown_paragraphs

_IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".bmp",
    ".gif",
    ".tiff",
    ".svg",
}


def _project_upload_fields(upload, *, select: dict | None = None) -> dict | object:
    if not select:
        return upload

    projected: dict[str, object] = {}
    for field_name, enabled in select.items():
        if not enabled:
            continue
        if isinstance(upload, dict):
            projected[field_name] = upload.get(field_name)
        else:
            projected[field_name] = getattr(upload, field_name, None)
    return projected


def _is_image_path(value: str) -> bool:
    return Path((value or "").strip().lower()).suffix in _IMAGE_EXTENSIONS


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
    image_analysis_hint: str | None = None,
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
    if image_analysis_hint:
        message_hints.append(image_analysis_hint)

    user_message_for_prompt = body.content
    if message_hints:
        user_message_for_prompt = f"{body.content}\n\n绯荤粺鎻愮ず锛歕n" + "\n".join(
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


def _extract_image_upload_ids(rag_results) -> list[str]:
    upload_ids: list[str] = []
    seen: set[str] = set()
    for item in rag_results or []:
        source = getattr(item, "source", None)
        metadata = getattr(item, "metadata", None) or {}
        source_type_raw = (
            str(getattr(source, "source_type", "document") or "").strip().lower()
        )
        source_type = normalize_source_type(source_type_raw).value
        source_filename = str(getattr(source, "filename", "") or "").strip().lower()
        metadata_filename = str(metadata.get("filename") or "").strip().lower()
        is_image_source = source_type_raw == "image" or (
            source_type_raw == "document"
            and str(metadata.get("file_type") or "").strip().lower() == "image"
        )
        if not is_image_source:
            is_image_source = _is_image_path(source_filename) or _is_image_path(
                metadata_filename
            )
        upload_id = str(metadata.get("upload_id") or "").strip()
        if not upload_id:
            continue
        if not is_image_source and source_type != "image":
            continue
        if upload_id in seen:
            continue
        seen.add(upload_id)
        upload_ids.append(upload_id)
    return upload_ids


async def build_image_analysis_hint(
    *,
    project_id: str,
    user_message: str,
    rag_results,
    requested_source_ids: list[str] | None = None,
) -> tuple[str | None, str | None, str | None]:
    image_upload_ids = _extract_image_upload_ids(rag_results)
    if requested_source_ids:
        seen_ids = set(image_upload_ids)
        for source_id in requested_source_ids:
            normalized = str(source_id or "").strip()
            if not normalized or normalized in seen_ids:
                continue
            seen_ids.add(normalized)
            image_upload_ids.append(normalized)
    if not image_upload_ids:
        return None, None, None

    try:
        upload_rows = await db_service.db.upload.find_many(
            where={
                "projectId": project_id,
                "id": {"in": image_upload_ids},
                "status": "ready",
            },
        )
        upload_rows = [
            _project_upload_fields(
                upload,
                select={"id": True, "filename": True, "filepath": True},
            )
            for upload in upload_rows or []
        ]
    except Exception as exc:
        logger.warning("chat image lookup failed: project=%s error=%s", project_id, exc)
        return None, "image_lookup_error", None

    image_inputs: list[dict[str, str]] = []
    for upload in upload_rows or []:
        if isinstance(upload, dict):
            upload_id = str(upload.get("id") or "").strip()
            filename = str(upload.get("filename") or "").strip()
            filepath = str(upload.get("filepath") or "").strip()
        else:
            upload_id = str(getattr(upload, "id", "") or "").strip()
            filename = str(getattr(upload, "filename", "") or "").strip()
            filepath = str(getattr(upload, "filepath", "") or "").strip()
        if not upload_id or not filepath:
            continue
        if not (_is_image_path(filename) or _is_image_path(filepath)):
            continue
        image_inputs.append(
            {"id": upload_id, "filename": filename, "filepath": filepath}
        )
        if len(image_inputs) >= 2:
            break

    if not image_inputs:
        return None, "image_not_ready", None

    analysis = await ai_service.analyze_images_for_chat(
        user_message=user_message,
        image_inputs=image_inputs,
    )
    if not analysis or not analysis.get("content"):
        reason = (analysis or {}).get("reason") if isinstance(analysis, dict) else None
        vision_model = (
            str((analysis or {}).get("model") or "").strip()
            if isinstance(analysis, dict)
            else ""
        )
        return None, reason or "image_analysis_unavailable", vision_model or None

    return (
        "图片可视解析补充（仅基于图中可见信息）：\n" + str(analysis["content"]).strip(),
        None,
        str(analysis.get("model") or "").strip() or None,
    )


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
                "请将下面这段回复改写成自然、温和的助教口吻；"
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
                "这次 AI 回复超时了，但我已收到你的需求。"
                "你可以先补充教学目标、重难点或使用场景，我会在下一次回复里继续接上。"
            )
        else:
            assistant_content = (
                "AI 服务暂时不可用，但我已收到你的需求。"
                "你可以先补充更多细节，我会在恢复后继续帮你完善。"
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
