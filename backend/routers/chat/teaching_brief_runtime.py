from __future__ import annotations

import json
import os
import re
import time
from typing import Any

from services.ai import ModelRouteTask, ai_service
from services.generation_session_service.teaching_brief import (
    compute_teaching_brief_readiness,
    normalize_teaching_brief,
    parse_session_options,
)

BRIEF_EXTRACTION_TURN_COUNT_KEY = "_brief_extraction_turn_count"
BRIEF_EXTRACTION_LAST_SCHEDULED_AT_KEY = "_brief_extraction_last_scheduled_at"
BRIEF_EXTRACTION_REFRESH_AFTER_MS = 3500
BRIEF_EXTRACTION_IDLE_TURNS_DEFAULT = 4

_MISSING_FIELD_LABELS = {
    "topic": "主题",
    "audience": "受众",
    "knowledge_points": "知识点",
    "duration_or_pages": "课时或页数",
}

_GENERATION_INTENT_PATTERNS = [
    r"(生成|开始|启动|创建|做一套|出一套).{0,12}(ppt|课件|幻灯片)",
    r"(ppt|课件|幻灯片).{0,12}(生成|开始|启动|创建)",
    r"(直接|现在|马上).{0,8}(完整大纲|教学大纲|课件大纲)",
]

_GENERATION_CONFIRMATION_PATTERNS = [
    r"(合理|可以|没问题|好|好的|行|确认|同意).{0,8}(开始|生成|启动|继续|做|出).{0,4}(吧|来|课件|ppt|幻灯片)?",
    r"(就|按|照).{0,4}(这个|当前|上述|上面|方案|框架).{0,8}(生成|开始|启动|做|出|来)",
    r"(开始|生成|启动|做|出).{0,6}(吧|来吧|就这样)",
]

GENERATION_ACTION_OPEN_GENERATION_CONFIRM = "open_generation_confirm"

_DIRECT_OUTPUT_INTENT_RE = re.compile(
    r"(直接|现在|马上).{0,8}(给我|输出|生成|整理).{0,8}(完整)?(教学)?大纲|开始.{0,8}(生成|做|出)",
    re.IGNORECASE,
)


def _env_positive_int(name: str, default: int) -> int:
    raw = str(os.getenv(name, "") or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def resolve_brief_extraction_idle_turns() -> int:
    legacy_default = _env_positive_int(
        "BRIEF_EXTRACTION_INTERVAL",
        BRIEF_EXTRACTION_IDLE_TURNS_DEFAULT,
    )
    return max(
        1,
        min(_env_positive_int("BRIEF_EXTRACTION_IDLE_TURNS", legacy_default), 20),
    )


def resolve_brief_extraction_interval() -> int:
    return resolve_brief_extraction_idle_turns()


def resolve_brief_extraction_debounce_seconds() -> int:
    return max(0, min(_env_positive_int("BRIEF_EXTRACTION_SCHEDULE_DEBOUNCE_SECONDS", 3), 30))


def resolve_brief_extraction_refresh_after_ms() -> int:
    return max(
        500,
        min(
            _env_positive_int(
                "BRIEF_EXTRACTION_REFRESH_AFTER_MS",
                BRIEF_EXTRACTION_REFRESH_AFTER_MS,
            ),
            15000,
        ),
    )


def detect_generation_intent(content: str) -> bool:
    normalized = str(content or "").strip().lower()
    if not normalized:
        return False
    explicit_intent = any(
        re.search(pattern, normalized, re.IGNORECASE)
        for pattern in _GENERATION_INTENT_PATTERNS
    )
    if explicit_intent:
        return True
    return any(
        re.search(pattern, normalized, re.IGNORECASE)
        for pattern in _GENERATION_CONFIRMATION_PATTERNS
    )


def build_generation_intent_payload(
    *,
    content: str,
    brief_raw: Any,
) -> dict[str, Any]:
    brief = normalize_teaching_brief(brief_raw)
    readiness = dict(brief.get("readiness") or compute_teaching_brief_readiness(brief))
    generation_intent = detect_generation_intent(content)
    can_generate = bool(readiness.get("can_generate"))
    generation_action = None
    if generation_intent and can_generate:
        generation_action = GENERATION_ACTION_OPEN_GENERATION_CONFIRM
    generation_ready = generation_action is not None
    blocked_reason = ""
    if generation_intent and not generation_action:
        missing_fields = list(readiness.get("missing_fields") or [])
        if missing_fields:
            blocked_reason = "教学需求单尚不完整：缺少" + "、".join(
                _MISSING_FIELD_LABELS.get(field, field) for field in missing_fields
            )
        elif status != "confirmed":
            blocked_reason = "请先确认教学需求单"
        else:
            blocked_reason = "教学需求单尚未满足生成条件"
    return {
        "generation_intent": generation_intent,
        "generation_ready": generation_ready,
        "generation_blocked_reason": blocked_reason,
        "generation_action": generation_action,
    }


def _normalize_recent_rounds(history_payload: list[dict[str, Any]]) -> list[dict[str, str]]:
    recent_messages: list[dict[str, str]] = []
    for item in history_payload[-6:]:
        role = str(item.get("role") or "").strip().lower()
        content = str(item.get("content") or "").strip()
        if role not in {"user", "assistant"} or not content:
            continue
        recent_messages.append({"role": role, "content": content})
    return recent_messages


def _build_default_generation_config(brief_raw: Any) -> dict[str, Any]:
    brief = normalize_teaching_brief(brief_raw)
    style_profile = brief.get("style_profile") or {}
    visual_tone = str(style_profile.get("visual_tone") or "").strip() or "free"
    template_family = str(style_profile.get("template_family") or "").strip().lower()
    layout_mode = "classic" if template_family and template_family != "auto" else "smart"
    page_count = brief.get("target_pages")
    try:
        resolved_page_count = int(page_count)
    except (TypeError, ValueError):
        resolved_page_count = 8
    resolved_page_count = max(1, min(resolved_page_count, 50))
    prompt_segments = [
        str(brief.get("topic") or "").strip(),
        *[str(item).strip() for item in (brief.get("teaching_objectives") or [])[:2]],
    ]
    prompt = " | ".join(segment for segment in prompt_segments if segment) or "课程主题"
    return {
        "prompt": prompt,
        "pageCount": resolved_page_count,
        "visualStyle": visual_tone,
        "layoutMode": layout_mode,
        "templateId": (template_family or None) if layout_mode == "classic" else None,
        "visualPolicy": "auto",
    }


async def build_generation_confirm_draft(
    *,
    content: str,
    brief_raw: Any,
    history_payload: list[dict[str, Any]],
) -> dict[str, Any] | None:
    intent_payload = build_generation_intent_payload(content=content, brief_raw=brief_raw)
    if not intent_payload.get("generation_ready"):
        return None

    brief = normalize_teaching_brief(brief_raw)
    recent_rounds = _normalize_recent_rounds(history_payload)
    default_config = _build_default_generation_config(brief)
    prompt = (
        "你是 Spectra 的课件生成确认草稿助手。"
        "请基于最近三轮对话和当前教学需求单，输出一个 JSON 对象，不要输出解释。"
        "\n输出格式："
        '\n{"summary":"...","prompt":"...","config":{"prompt":"...","pageCount":8,"visualStyle":"free","layoutMode":"smart","templateId":null,"visualPolicy":"auto"},"source_message_ids":["..."]}'
        "\n要求："
        "\n1. summary 用中文，4-6 句，概括教学主题、受众、范围、组织方式与生成目标。"
        "\n2. prompt 用中文，直接可作为 Diego 的生成提示。"
        "\n3. config.pageCount 若需求单没有明确页数，固定输出 8。"
        "\n4. config.layoutMode 只能是 smart 或 classic。"
        "\n5. config.visualPolicy 只能是 auto、media_required、basic_graphics_only。"
        "\n6. source_message_ids 仅保留最近三轮中真实存在的 message id；拿不到时输出空数组。"
        "\n7. 不要要求用户再次确认需求单，不要输出逐页 PPT 文本。"
        "\n\n当前教学需求单：\n"
        f"{json.dumps(brief, ensure_ascii=False, indent=2)}"
        "\n\n最近三轮对话：\n"
        f"{json.dumps(recent_rounds, ensure_ascii=False, indent=2)}"
        "\n\n默认生成配置：\n"
        f"{json.dumps(default_config, ensure_ascii=False, indent=2)}"
    )
    try:
        result = await ai_service.generate(
            prompt=prompt,
            route_task=ModelRouteTask.SHORT_TEXT_POLISH,
            max_tokens=4000,
            response_format={"type": "json_object"},
        )
        parsed = json.loads(str(result.get("content") or "").strip() or "{}")
    except Exception:
        parsed = {}

    if not isinstance(parsed, dict):
        parsed = {}
    config = parsed.get("config") if isinstance(parsed.get("config"), dict) else {}
    try:
        page_count = int(config.get("pageCount"))
    except (TypeError, ValueError):
        page_count = int(default_config["pageCount"])
    page_count = max(1, min(page_count, 50))
    layout_mode = "classic" if config.get("layoutMode") == "classic" else "smart"
    visual_policy = str(config.get("visualPolicy") or "auto").strip().lower()
    if visual_policy not in {"auto", "media_required", "basic_graphics_only"}:
        visual_policy = "auto"

    return {
        "summary": str(parsed.get("summary") or "").strip()
        or f"本次将围绕{brief.get('topic') or '当前主题'}生成课件，面向{brief.get('audience') or '目标受众'}，并结合最近对话整理教学重点与生成约束。",
        "prompt": str(parsed.get("prompt") or "").strip()
        or str(default_config["prompt"]),
        "config": {
            "prompt": str(config.get("prompt") or parsed.get("prompt") or default_config["prompt"]).strip()
            or str(default_config["prompt"]),
            "pageCount": page_count,
            "visualStyle": str(config.get("visualStyle") or default_config["visualStyle"]).strip()
            or str(default_config["visualStyle"]),
            "layoutMode": layout_mode,
            "templateId": (
                str(config.get("templateId")).strip()
                if config.get("templateId") is not None and str(config.get("templateId")).strip()
                else default_config["templateId"]
            ),
            "visualPolicy": visual_policy,
        },
        "source_message_ids": [],
    }


def _estimate_missing_fields_after_message(
    *,
    brief_raw: Any,
    content: str,
) -> list[str]:
    brief = normalize_teaching_brief(brief_raw)
    missing_fields = list((brief.get("readiness") or {}).get("missing_fields") or [])
    normalized = str(content or "").strip()
    if not normalized or not missing_fields:
        return missing_fields

    remaining = set(missing_fields)
    if "topic" in remaining and re.search(
        r"(主题|课题|内容)[是为:]?\s*[^，。,\n]{2,40}|(讲|关于)\s*[^，。,\n]{2,40}",
        normalized,
        re.IGNORECASE,
    ):
        remaining.discard("topic")
    if "audience" in remaining and re.search(
        r"(?:面向|给|针对)\s*[^，。,\n]{2,30}",
        normalized,
        re.IGNORECASE,
    ):
        remaining.discard("audience")
    if "knowledge_points" in remaining and re.search(
        r"(知识点|内容包括|包括|涵盖|讲(?:解)?的内容)",
        normalized,
        re.IGNORECASE,
    ):
        remaining.discard("knowledge_points")
    if "duration_or_pages" in remaining and re.search(
        r"(\d{1,3}\s*分钟)|(\d{1,2}\s*课时)|(\d{1,2}\s*(?:页|p\b|pages?))",
        normalized,
        re.IGNORECASE,
    ):
        remaining.discard("duration_or_pages")
    return [field for field in missing_fields if field in remaining]


def _detect_answered_missing_fields(
    *,
    missing_fields: list[str],
    content: str,
) -> set[str]:
    normalized = str(content or "").strip()
    if not normalized:
        return set()

    answered: set[str] = set()
    remaining = set(missing_fields)
    if "topic" in remaining and re.search(
        r"(第[一二三四五六七八九十\d]+章|主题|课题|讲什么|讲(?:解)?\s*[^，。,\n]{2,40}|着重\s*[^，。,\n]{2,40})",
        normalized,
        re.IGNORECASE,
    ):
        answered.add("topic")
    if "audience" in remaining and re.search(
        r"(?:面向|针对)\s*[^，。,\n]{2,40}|给\s*[^，。,\n]{2,40}(?:学生|老师|教师|学员|班|专业)",
        normalized,
        re.IGNORECASE,
    ):
        answered.add("audience")
    if "knowledge_points" in remaining and re.search(
        r"(知识点|内容包括|包括|涵盖|讲哪些|全部讲|都讲|着重|重点讲|算法部分)",
        normalized,
        re.IGNORECASE,
    ):
        answered.add("knowledge_points")
    if "duration_or_pages" in remaining and re.search(
        r"(\d{1,3}\s*分钟)|(\d{1,2}\s*个?\s*课时)|(\d{1,3}\s*(?:页|p\b|pages?))",
        normalized,
        re.IGNORECASE,
    ):
        answered.add("duration_or_pages")
    return answered


def _contains_field_evidence(content: str) -> bool:
    normalized = str(content or "").strip()
    if not normalized:
        return False
    return bool(
        re.search(
            r"(第[一二三四五六七八九十\d]+章|主题|课题|面向|针对|知识点|内容包括|包括|涵盖|讲哪些|全部讲|都讲|着重|重点讲|\d{1,3}\s*分钟|\d{1,2}\s*个?\s*课时|\d{1,3}\s*(?:页|p\b|pages?))",
            normalized,
            re.IGNORECASE,
        )
    )


def _recently_scheduled(options: dict[str, Any], *, now: float) -> bool:
    try:
        last_scheduled_at = float(options.get(BRIEF_EXTRACTION_LAST_SCHEDULED_AT_KEY) or 0)
    except (TypeError, ValueError):
        return False
    debounce_seconds = resolve_brief_extraction_debounce_seconds()
    return debounce_seconds > 0 and last_scheduled_at > 0 and now - last_scheduled_at < debounce_seconds


def plan_brief_extraction(
    *,
    options_raw: Any,
    brief_raw: Any,
    latest_user_message: str,
) -> dict[str, Any]:
    options = parse_session_options(options_raw)
    now = time.time()
    try:
        previous_turn_count = int(options.get(BRIEF_EXTRACTION_TURN_COUNT_KEY) or 0)
    except (TypeError, ValueError):
        previous_turn_count = 0
    next_turn_count = previous_turn_count + 1

    brief = normalize_teaching_brief(brief_raw)
    current_missing_fields = list((brief.get("readiness") or {}).get("missing_fields") or [])
    estimated_missing_fields = _estimate_missing_fields_after_message(
        brief_raw=brief,
        content=latest_user_message,
    )
    answered_missing_fields = _detect_answered_missing_fields(
        missing_fields=current_missing_fields,
        content=latest_user_message,
    )
    generation_intent_trigger = detect_generation_intent(
        latest_user_message
    ) or bool(_DIRECT_OUTPUT_INTENT_RE.search(str(latest_user_message or "")))
    missing_field_answer_trigger = bool(answered_missing_fields)
    field_evidence_trigger = _contains_field_evidence(latest_user_message)
    immediate_trigger = (
        len(current_missing_fields) >= 3 and len(estimated_missing_fields) <= 1
    )
    idle_fallback_trigger = next_turn_count >= resolve_brief_extraction_idle_turns()
    extraction_reason = None
    if generation_intent_trigger and bool(
        (brief.get("readiness") or {}).get("can_generate")
    ):
        extraction_reason = None
    elif generation_intent_trigger:
        extraction_reason = "generation_intent"
    elif missing_field_answer_trigger:
        extraction_reason = "missing_field_answer"
    elif immediate_trigger or field_evidence_trigger:
        extraction_reason = "field_evidence"
    elif idle_fallback_trigger:
        extraction_reason = "interval"

    should_run = extraction_reason is not None
    debounced = bool(
        should_run
        and extraction_reason not in {"missing_field_answer", "field_evidence"}
        and _recently_scheduled(options, now=now)
    )
    if debounced:
        should_run = False

    options[BRIEF_EXTRACTION_TURN_COUNT_KEY] = 0 if should_run else next_turn_count
    if should_run:
        options[BRIEF_EXTRACTION_LAST_SCHEDULED_AT_KEY] = now

    return {
        "should_run": should_run,
        "immediate_trigger": immediate_trigger,
        "interval_trigger": idle_fallback_trigger,
        "idle_fallback_trigger": idle_fallback_trigger,
        "idle_turns_without_extraction": next_turn_count,
        "field_evidence_trigger": field_evidence_trigger,
        "generation_intent_trigger": generation_intent_trigger,
        "missing_field_answer_trigger": missing_field_answer_trigger,
        "debounced": debounced,
        "reason": extraction_reason if should_run else None,
        "extraction_reason": extraction_reason if should_run else None,
        "detected_reason": extraction_reason,
        "answered_missing_fields": sorted(answered_missing_fields),
        "refresh_after_ms": resolve_brief_extraction_refresh_after_ms(),
        "pending_turn_count": options[BRIEF_EXTRACTION_TURN_COUNT_KEY],
        "next_options": options,
    }
