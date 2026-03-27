from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from services.ai import ai_service
from services.ai.model_router import ModelRouteTask
from services.generation_session_service.tool_content_builder_fallbacks import (
    SUPPORTED_CARD_IDS,
    card_query_text,
    fallback_content,
    fallback_simulator_turn_result,
)
from services.project_space_service import project_space_service

logger = logging.getLogger(__name__)


def _should_attempt_ai_generation() -> bool:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return False
    raw = os.getenv("STUDIO_TOOL_ENABLE_AI_GENERATION")
    if raw is None:
        return True
    return raw.strip().lower() not in {"0", "false", "no"}


async def _load_rag_snippets(
    *,
    project_id: str,
    query: str,
    rag_source_ids: list[str] | None,
) -> list[str]:
    timeout_seconds = float(os.getenv("CHAT_RAG_TIMEOUT_SECONDS", "5") or "5")
    filters = {"file_ids": rag_source_ids} if rag_source_ids else None
    try:
        coroutine = ai_service._retrieve_rag_context(
            project_id=project_id,
            query=query,
            top_k=4,
            score_threshold=0.3,
            session_id=None,
            filters=filters,
        )
        results = (
            await asyncio.wait_for(coroutine, timeout=timeout_seconds)
            if timeout_seconds > 0
            else await coroutine
        )
    except Exception as exc:
        logger.warning(
            "studio tool rag loading failed for project=%s: %s",
            project_id,
            exc,
        )
        return []

    snippets: list[str] = []
    for item in results or []:
        if not isinstance(item, dict):
            continue
        content = str(item.get("content") or "").strip()
        if content:
            snippets.append(content[:400])
    return snippets[:3]


async def _load_source_artifact_hint(
    *,
    source_artifact_id: str | None,
) -> str | None:
    if not source_artifact_id:
        return None
    try:
        artifact = await project_space_service.get_artifact(source_artifact_id)
    except Exception as exc:
        logger.warning(
            "failed to load source artifact %s: %s",
            source_artifact_id,
            exc,
        )
        return None
    if not artifact:
        return None
    metadata = getattr(artifact, "metadata", None)
    if isinstance(metadata, dict):
        title = str(metadata.get("title") or "").strip()
        if title:
            return f"{title} ({artifact.type})"
    return f"{artifact.type}:{artifact.id}"


def _strip_json_fence(text: str) -> str:
    candidate = (text or "").strip()
    if candidate.startswith("```"):
        lines = candidate.splitlines()
        if len(lines) >= 3:
            candidate = "\n".join(lines[1:-1]).strip()
    return candidate


async def _generate_structured_content(
    *,
    card_id: str,
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
) -> dict[str, Any] | None:
    if not _should_attempt_ai_generation():
        return None
    schema_hint = {
        "courseware_ppt": (
            '{"title":"", "summary":"", "pages":12, "template":"default"}'
        ),
        "word_document": (
            '{"title":"", "summary":"", "document_variant":"layered_lesson_plan"}'
        ),
        "knowledge_mindmap": (
            '{"title":"",'
            ' "nodes":[{"id":"","parent_id":null,"title":"","summary":""}]}'
        ),
        "interactive_quick_quiz": (
            '{"title":"",'
            ' "questions":[{"id":"","question":"","options":[""],'
            '"answer":"","explanation":""}]}'
        ),
        "interactive_games": '{"title":"", "html":""}',
        "classroom_qa_simulator": (
            '{"title":"", "summary":"", "key_points":[""], '
            '"turns":[{"student":"","question":"","teacher_hint":"",'
            '"feedback":""}]}'
        ),
        "demonstration_animations": (
            '{"title":"", "html":"", "summary":"", '
            '"scenes":[{"title":"","description":""}]}'
        ),
        "speaker_notes": (
            '{"title":"", "summary":"", '
            '"slides":[{"page":1,"title":"","script":"",'
            '"action_hint":"","transition_line":""}]}'
        ),
    }.get(card_id)
    if not schema_hint:
        return None
    prompt = (
        "你是教学工具内容生成器。请严格只返回 JSON，不要加 markdown 代码块。\n"
        f"卡片类型: {card_id}\n"
        f"配置: {json.dumps(config, ensure_ascii=False)}\n"
        f"源成果提示: {source_hint or '无'}\n"
        f"RAG 摘要: {json.dumps(rag_snippets, ensure_ascii=False)}\n"
        "要求：产物必须可直接落盘使用，内容不能为空，避免占位符。\n"
        f"输出 JSON 结构示例: {schema_hint}"
    )
    try:
        response = await ai_service.generate(
            prompt=prompt,
            route_task=ModelRouteTask.LESSON_PLAN_REASONING,
            has_rag_context=bool(rag_snippets),
            max_tokens=1600,
        )
        payload = json.loads(_strip_json_fence(str(response.get("content") or "")))
        return payload if isinstance(payload, dict) else None
    except Exception as exc:
        logger.warning(
            "studio tool AI content generation failed for %s: %s",
            card_id,
            exc,
        )
        return None


async def build_studio_tool_artifact_content(
    *,
    card_id: str,
    project_id: str,
    config: dict[str, Any] | None,
    source_artifact_id: str | None = None,
    rag_source_ids: list[str] | None = None,
) -> dict[str, Any] | None:
    if card_id not in SUPPORTED_CARD_IDS:
        return None
    cfg = dict(config or {})
    query = card_query_text(card_id, cfg)
    rag_snippets, source_hint = await asyncio.gather(
        _load_rag_snippets(
            project_id=project_id,
            query=query,
            rag_source_ids=rag_source_ids,
        ),
        _load_source_artifact_hint(source_artifact_id=source_artifact_id),
    )
    ai_payload = await _generate_structured_content(
        card_id=card_id,
        config=cfg,
        rag_snippets=rag_snippets,
        source_hint=source_hint,
    )
    fallback_payload = fallback_content(
        card_id=card_id,
        config=cfg,
        rag_snippets=rag_snippets,
        source_hint=source_hint,
        source_artifact_id=source_artifact_id,
    )
    if not ai_payload:
        return fallback_payload
    merged = dict(fallback_payload)
    for key, value in ai_payload.items():
        if value not in (None, "", [], {}):
            merged[key] = value
    return merged


async def build_studio_simulator_turn_update(
    *,
    current_content: dict[str, Any],
    teacher_answer: str,
    config: dict[str, Any] | None,
    project_id: str,
    rag_source_ids: list[str] | None = None,
    turn_anchor: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    cfg = dict(config or {})
    query = str(
        cfg.get("topic")
        or current_content.get("question_focus")
        or current_content.get("title")
        or "课堂问答推进"
    )
    rag_snippets = await _load_rag_snippets(
        project_id=project_id,
        query=query,
        rag_source_ids=rag_source_ids,
    )
    if _should_attempt_ai_generation():
        prompt = (
            "你是课堂问答模拟器。请严格只返回 JSON，不要加 markdown 代码块。\n"
            f"当前脚本: {json.dumps(current_content, ensure_ascii=False)}\n"
            f"教师回答: {teacher_answer}\n"
            f"配置: {json.dumps(cfg, ensure_ascii=False)}\n"
            f"RAG 摘要: {json.dumps(rag_snippets, ensure_ascii=False)}\n"
            '请返回 {"turn_result": {...}, "updated_content": {...}}，'
            "其中 updated_content 必须是完整 artifact content。"
        )
        try:
            response = await ai_service.generate(
                prompt=prompt,
                route_task=ModelRouteTask.LESSON_PLAN_REASONING,
                has_rag_context=bool(rag_snippets),
                max_tokens=1800,
            )
            payload = json.loads(_strip_json_fence(str(response.get("content") or "")))
            if isinstance(payload, dict):
                updated = payload.get("updated_content")
                turn_result = payload.get("turn_result")
                if isinstance(updated, dict) and isinstance(turn_result, dict):
                    return updated, turn_result
        except Exception as exc:
            logger.warning("simulator turn AI generation failed: %s", exc)

    return fallback_simulator_turn_result(
        current_content=current_content,
        teacher_answer=teacher_answer,
        config=cfg,
        turn_anchor=turn_anchor,
        rag_snippets=rag_snippets,
    )
