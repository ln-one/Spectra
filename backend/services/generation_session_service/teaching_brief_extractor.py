from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any

from services.ai import ModelRouteTask, ai_service
from services.database import db_service
from services.generation_session_service.teaching_brief import (
    ALLOWED_TEACHING_BRIEF_FIELDS,
    _normalize_field_value,
    auto_apply_ai_proposal,
    load_teaching_brief,
    store_teaching_brief,
)

logger = logging.getLogger(__name__)

_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*(?P<body>\{.*\})\s*```", re.DOTALL)


def _env_flag(name: str, default: bool) -> bool:
    raw = str(os.getenv(name, "") or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    raw = str(os.getenv(name, "") or "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def _resolve_extraction_model() -> str | None:
    value = str(os.getenv("BRIEF_EXTRACTION_MODEL", "") or "").strip()
    return value or None


def _extraction_enabled() -> bool:
    return _env_flag("BRIEF_EXTRACTION_ENABLED", True)


def _resolve_timeout_seconds() -> float:
    return _env_float("BRIEF_EXTRACTION_TIMEOUT_SECONDS", 60.0)


def _resolve_context_rounds() -> int:
    return max(1, min(int(_env_float("BRIEF_EXTRACTION_CONTEXT_ROUNDS", 5)), 12))


def _resolve_max_tokens() -> int:
    return max(4000, min(int(_env_float("BRIEF_EXTRACTION_MAX_TOKENS", 12000)), 40000))


def _resolve_min_confidence() -> float:
    return max(0.0, min(_env_float("BRIEF_EXTRACTION_MIN_CONFIDENCE", 0.6), 1.0))


def _resolve_overwrite_confidence() -> float:
    return max(
        0.0,
        min(_env_float("BRIEF_EXTRACTION_OVERWRITE_CONFIDENCE", 0.8), 1.0),
    )


def _strip_json_wrapper(content: str) -> str:
    text = str(content or "").strip()
    if not text:
        return ""
    fenced = _JSON_BLOCK_RE.search(text)
    if fenced:
        return str(fenced.group("body") or "").strip()
    if text.startswith("{") and text.endswith("}"):
        return text
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return text[start : end + 1].strip()
    return text


def _has_meaningful_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list):
        return bool(value)
    if isinstance(value, dict):
        return any(_has_meaningful_value(item) for item in value.values())
    return True


def _normalize_extracted_fields(raw_fields: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for field_name, value in dict(raw_fields or {}).items():
        if field_name not in ALLOWED_TEACHING_BRIEF_FIELDS:
            continue
        normalized_value = _normalize_field_value(field_name, value)
        if not _has_meaningful_value(normalized_value):
            continue
        normalized[field_name] = value
    return normalized


def _parse_extraction_response(content: str) -> dict[str, Any] | None:
    payload = _strip_json_wrapper(content)
    if not payload:
        return None
    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError:
        logger.warning("brief extraction returned non-json payload: %s", payload[:200])
        return None
    if not isinstance(parsed, dict):
        return None
    if not parsed:
        return None

    raw_fields = (
        parsed.get("fields") if isinstance(parsed.get("fields"), dict) else parsed
    )
    fields = _normalize_extracted_fields(raw_fields)
    if not fields:
        return None

    confidence = parsed.get("confidence", 0.75)
    try:
        confidence_value = float(confidence)
    except (TypeError, ValueError):
        confidence_value = 0.75
    confidence_value = max(0.0, min(confidence_value, 1.0))
    if confidence_value < _resolve_min_confidence():
        return None

    return {
        "fields": fields,
        "confidence": confidence_value,
    }


def _build_extraction_prompt(
    *,
    recent_messages: list[dict[str, str]],
    current_brief: dict[str, Any],
    missing_fields: list[str],
) -> str:
    dialogue_lines = []
    for item in recent_messages:
        role = str(item.get("role") or "").strip().lower()
        content = str(item.get("content") or "").strip()
        if not role or not content:
            continue
        dialogue_lines.append(f"{role}: {content}")
    dialogue_text = "\n".join(dialogue_lines) or "(empty)"
    return (
        "你是 Spectra 教学需求单信息提取器。"
        "请根据最近几轮对话，提取当前可确认的教学需求字段。"
        "\n\n输出要求："
        "\n1. 只输出一个 JSON 对象，不要解释，不要 markdown。"
        "\n2. 如果没有可确认的新字段或修正，输出 {}。"
        "\n3. 允许字段：topic, audience, duration_minutes, lesson_hours, target_pages, "
        "teaching_objectives, knowledge_points, global_emphasis, global_difficulties, "
        "teaching_strategy, style_profile。"
        '\n4. 输出格式优先为 {"fields": {...}, "confidence": 0.0-1.0}。'
        "\n5. 可以做高置信度语义推断，但不要臆造未出现的信息。"
        "\n6. 如果你判断已有字段值是错的，并且最近对话给出了更可信的新值，可以输出修正后的字段，同时提高 confidence。"
        "\n7. 低置信度时宁可少提取，不要为了覆盖而覆盖。"
        "\n8. 只有 user 行是需求事实来源；assistant 行只作为上下文，不允许把 assistant 自己提出的课时、页数、受众、主题当作用户需求写入或覆盖。"
        "\n\n当前 brief：\n"
        f"{json.dumps(current_brief, ensure_ascii=False, indent=2)}"
        "\n\n当前缺失字段：\n"
        f"{json.dumps(missing_fields, ensure_ascii=False)}"
        "\n\n最近对话记录：\n"
        f"{dialogue_text}"
    )


def _next_session_state(current_state: str) -> str:
    if current_state not in {
        "IDLE",
        "CONFIGURING",
        "ANALYZING",
        "AWAITING_REQUIREMENTS_CONFIRM",
    }:
        return current_state
    return "CONFIGURING"


async def extract_brief_from_conversation(
    *,
    recent_messages: list[dict[str, str]],
    current_brief: dict[str, Any],
    missing_fields: list[str],
) -> dict[str, Any] | None:
    if not _extraction_enabled():
        return None
    if not recent_messages:
        return None

    prompt = _build_extraction_prompt(
        recent_messages=recent_messages,
        current_brief=current_brief,
        missing_fields=missing_fields,
    )
    try:
        ai_result = await asyncio.wait_for(
            ai_service.generate(
                prompt=prompt,
                model=_resolve_extraction_model(),
                route_task=ModelRouteTask.SHORT_TEXT_POLISH,
                max_tokens=_resolve_max_tokens(),
                response_format={"type": "json_object"},
            ),
            timeout=_resolve_timeout_seconds(),
        )
    except asyncio.TimeoutError:
        logger.info("brief extraction timed out")
        return None
    except Exception as exc:
        logger.warning("brief extraction failed: %s", exc)
        return None

    return _parse_extraction_response(str(ai_result.get("content") or ""))


def _select_fields_to_apply(
    *,
    current_brief: dict[str, Any],
    proposed_fields: dict[str, Any],
    confidence: float,
) -> tuple[dict[str, Any], list[str]]:
    selected: dict[str, Any] = {}
    overwritten_fields: list[str] = []
    allow_overwrite = confidence >= _resolve_overwrite_confidence()
    for field_name, value in dict(proposed_fields or {}).items():
        if field_name not in ALLOWED_TEACHING_BRIEF_FIELDS:
            continue
        current_value = _normalize_field_value(
            field_name, current_brief.get(field_name)
        )
        incoming_value = _normalize_field_value(field_name, value)
        if not _has_meaningful_value(incoming_value):
            continue
        if current_value == incoming_value:
            continue
        if _has_meaningful_value(current_value):
            if not allow_overwrite:
                continue
            overwritten_fields.append(field_name)
        selected[field_name] = value
    return selected, overwritten_fields


async def _load_recent_messages(
    *,
    project_id: str,
    session_id: str,
) -> list[dict[str, str]]:
    rows = await db_service.get_recent_conversation_messages(
        project_id=project_id,
        session_id=session_id,
        limit=_resolve_context_rounds() * 2,
        select={"role": True, "content": True},
    )
    recent_messages: list[dict[str, str]] = []
    for row in rows or []:
        role = str(getattr(row, "role", "") or "").strip().lower()
        content = str(getattr(row, "content", "") or "").strip()
        if role not in {"user", "assistant"} or not content:
            continue
        recent_messages.append({"role": role, "content": content})
    return recent_messages


async def run_background_brief_extraction(
    *,
    session_id: str,
    project_id: str,
) -> None:
    if not _extraction_enabled():
        return

    try:
        logger.info(
            "background_brief_extraction started session=%s project=%s",
            session_id,
            project_id,
        )
        session_record = await db_service.db.generationsession.find_unique(
            where={"id": session_id}
        )
        if session_record is None:
            logger.info(
                "background_brief_extraction skipped missing_session session=%s",
                session_id,
            )
            return

        current_brief = load_teaching_brief(getattr(session_record, "options", None))
        missing_fields = list(
            (current_brief.get("readiness") or {}).get("missing_fields") or []
        )
        recent_messages = await _load_recent_messages(
            project_id=project_id,
            session_id=session_id,
        )
        if not recent_messages:
            logger.info(
                "background_brief_extraction skipped no_recent_messages session=%s",
                session_id,
            )
            return

        extract_result = await extract_brief_from_conversation(
            recent_messages=recent_messages,
            current_brief=current_brief,
            missing_fields=missing_fields,
        )
        if not extract_result or not extract_result.get("fields"):
            logger.info("background_brief_extraction no_fields session=%s", session_id)
            return

        latest_record = session_record
        latest_brief = current_brief
        refreshed_record = await db_service.db.generationsession.find_unique(
            where={"id": session_id}
        )
        if refreshed_record is not None:
            latest_record = refreshed_record
            latest_brief = load_teaching_brief(
                getattr(refreshed_record, "options", None)
            )

        selected_fields, overwritten_fields = _select_fields_to_apply(
            current_brief=latest_brief,
            proposed_fields=dict(extract_result.get("fields") or {}),
            confidence=float(extract_result.get("confidence") or 0.0),
        )
        if not selected_fields:
            logger.info(
                "background_brief_extraction no_applicable_fields session=%s extracted_fields=%s confidence=%.2f",
                session_id,
                list(dict(extract_result.get("fields") or {}).keys()),
                float(extract_result.get("confidence") or 0.0),
            )
            return

        apply_result = auto_apply_ai_proposal(
            latest_brief,
            {
                "proposed_changes": selected_fields,
                "confidence": extract_result.get("confidence", 0.75),
                "requires_user_confirmation": False,
            },
        )
        applied_fields = list(apply_result.get("applied_fields") or [])
        if not applied_fields:
            logger.info(
                "background_brief_extraction no_applied_fields session=%s", session_id
            )
            return

        next_brief = apply_result["brief"]
        next_options = store_teaching_brief(
            getattr(latest_record, "options", None),
            brief=next_brief,
        )
        current_state = str(getattr(latest_record, "state", "") or "")
        await db_service.db.generationsession.update(
            where={"id": session_id},
            data={
                "options": json.dumps(next_options, ensure_ascii=False),
                "state": _next_session_state(current_state),
            },
        )
        logger.info(
            "background_brief_extraction session=%s applied_fields=%s overwritten_fields=%s confidence=%.2f",
            session_id,
            applied_fields,
            overwritten_fields,
            float(extract_result.get("confidence") or 0.0),
        )
    except Exception as exc:
        logger.warning(
            "background_brief_extraction failed session=%s error=%s",
            session_id,
            exc,
        )
