from __future__ import annotations

import json
import re
from typing import Any

from services.generation_session_service.run_constants import (
    build_default_project_title,
    build_default_session_title,
    build_pending_run_title,
    resolve_tool_label,
)

TITLE_MIN_LENGTH = 5
PROJECT_TITLE_MAX_LENGTH = 24
SESSION_TITLE_MAX_LENGTH = 18
RUN_TITLE_MAX_LENGTH = 18

GENERIC_TITLE_TOKENS = {
    "教学设计",
    "课程生成",
    "课程设计",
    "备课助手",
    "课件生成",
    "生成课件",
    "新建会话",
    "新建知识库",
    "会话",
    "项目",
    "知识库",
    "运行记录",
}

RUN_CONTEXT_NOISE_KEYS = {
    "generation_mode",
    "style_preset",
    "visual_policy",
    "template_id",
    "target_slide_count",
    "page_count",
    "pages",
    "card_id",
    "tool_type",
    "run_id",
    "session_id",
    "source_ids",
    "rag_source_ids",
    "client_session_id",
    "layout_mode",
}

RUN_CONTEXT_PRIORITY_KEYS = (
    "topic",
    "title",
    "prompt",
    "theme",
    "subject",
    "question",
    "task",
    "goal",
    "objective",
    "summary",
    "description",
    "instruction",
)

META_RESPONSE_MARKERS = (
    "用户要求",
    "用户的第一条教学需求",
    "第一条教学需求",
    "我需要",
    "我应该",
    "生成一个符合",
    "生成一个简短",
    "根据用户",
    "这是一个",
    "标题：",
    "输出：",
)

LEADING_NOISE_RE = re.compile(
    r"^(请|帮我|麻烦|我想|我要|需要|希望|准备|帮忙|做一个|生成一个|创建一个|新建一个)+"
)
TRAILING_PUNCT_RE = re.compile(r"[。；;，,：:\-—_~!！?？]+$")
ASCII_CONFIG_FRAGMENT_RE = re.compile(r"[A-Za-z]{4,}_[A-Za-z0-9_]+")
QUOTED_TEXT_RE = re.compile(r'[“"]([^"\n\r]{2,40})[”"]')
TITLE_LABEL_RE = re.compile(r"(?:标题|输出)\s*[：:]\s*([^\n\r]+)")


def normalize_text(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    return re.sub(r"\s+", " ", text)


def clean_title_candidate(value: Any, *, max_length: int) -> str:
    title = normalize_text(value)
    if not title:
        return ""
    labeled_match = TITLE_LABEL_RE.search(title)
    if labeled_match:
        title = labeled_match.group(1).strip()
    first_line = title.splitlines()[0].strip()
    if first_line:
        title = first_line
    title = title.replace("\n", " ").replace("\r", " ").strip()
    title = re.sub(r"^['\"“”‘’`#*\-]+", "", title)
    title = re.split(r"[。！？\n\r]", title, maxsplit=1)[0].strip()
    title = TRAILING_PUNCT_RE.sub("", title)
    title = re.sub(r"\s+", " ", title).strip()
    return title[:max_length].strip()


def count_visible_title_chars(value: Any) -> int:
    title = clean_title_candidate(value, max_length=64)
    return len(title.replace(" ", ""))


def extract_topic_seed(value: Any) -> str:
    text = normalize_text(value)
    if not text:
        return ""
    first_line = text.split("\n", 1)[0].strip()
    candidate = LEADING_NOISE_RE.sub("", first_line).strip()
    candidate = re.sub(
        r"(做|生成|创建|制作|整理|设计|产出|输出)(一份|一个|一套|一组)?",
        "",
        candidate,
    ).strip()
    candidate = re.sub(r"(关于|围绕|主题是|主题为)", "", candidate).strip()
    candidate = re.split(r"[，。；;：:,.!?？!()（）\[\]]", candidate, maxsplit=1)[0]
    candidate = candidate.strip()
    if len(candidate) > 14:
        candidate = candidate[:14].strip()
    return candidate


def has_basis_overlap(title: str, basis_value: Any) -> bool:
    normalized_title = clean_title_candidate(title, max_length=32)
    basis_seed = extract_topic_seed(basis_value)
    if not normalized_title or not basis_seed:
        return False
    if basis_seed in normalized_title:
        return True
    if len(basis_seed) < 2:
        return False
    return any(fragment in normalized_title for fragment in _iter_bigrams(basis_seed))


def build_scene_suffix(scene: str, *, tool_type: str | None = None) -> str:
    normalized_scene = str(scene or "").strip().lower()
    if normalized_scene == "project":
        return "资料库"
    if normalized_scene == "session":
        return "备课"
    if normalized_scene == "run":
        label = clean_title_candidate(
            resolve_tool_label(tool_type or ""),
            max_length=RUN_TITLE_MAX_LENGTH,
        )
        if label.endswith("生成") and len(label) > 2:
            label = label[:-2].strip()
        return label or "任务"
    return ""


def normalize_effective_title(
    *,
    raw_title: Any,
    basis_value: Any,
    scene: str,
    max_length: int,
    tool_type: str | None = None,
) -> str:
    title = clean_title_candidate(raw_title, max_length=max_length)
    basis_seed = extract_topic_seed(basis_value)
    suffix = build_scene_suffix(scene, tool_type=tool_type)

    if (
        (not title)
        or is_generic_title(title)
        or is_bad_run_title(title)
        or (basis_seed and not has_basis_overlap(title, basis_seed))
        or count_visible_title_chars(title) < TITLE_MIN_LENGTH
    ):
        if basis_seed:
            title = clean_title_candidate(
                f"{basis_seed}{suffix}",
                max_length=max_length,
            )
        else:
            title = ""

    if count_visible_title_chars(title) < TITLE_MIN_LENGTH:
        return ""
    return title


def extract_seed_from_model_response(value: Any) -> str:
    text = normalize_text(value)
    if not text:
        return ""
    labeled_match = TITLE_LABEL_RE.search(text)
    if labeled_match:
        return extract_topic_seed(labeled_match.group(1))
    quoted_matches = QUOTED_TEXT_RE.findall(text)
    for match in quoted_matches:
        seed = extract_topic_seed(match)
        if seed:
            return seed
    return ""


def is_meta_title_response(value: Any) -> bool:
    text = normalize_text(value)
    if not text:
        return False
    return any(marker in text for marker in META_RESPONSE_MARKERS)


def _collect_run_context_values(
    value: Any,
    *,
    depth: int = 0,
    seen: set[str] | None = None,
) -> list[str]:
    if depth > 3:
        return []
    if seen is None:
        seen = set()
    values: list[str] = []
    if isinstance(value, dict):
        prioritized: list[tuple[str, Any]] = []
        remaining: list[tuple[str, Any]] = []
        for key, nested in value.items():
            normalized_key = str(key or "").strip().lower()
            if normalized_key in RUN_CONTEXT_NOISE_KEYS:
                continue
            bucket = prioritized if normalized_key in RUN_CONTEXT_PRIORITY_KEYS else remaining
            bucket.append((normalized_key, nested))
        for _, nested in [*prioritized, *remaining]:
            values.extend(_collect_run_context_values(nested, depth=depth + 1, seen=seen))
        return values
    if isinstance(value, list):
        for nested in value[:4]:
            values.extend(_collect_run_context_values(nested, depth=depth + 1, seen=seen))
        return values
    if isinstance(value, (str, int, float)):
        text = extract_topic_seed(value)
        normalized = text.lower()
        if (
            text
            and len(text) >= 2
            and normalized not in seen
            and not ASCII_CONFIG_FRAGMENT_RE.search(text)
        ):
            seen.add(normalized)
            values.append(text)
    return values


def extract_run_context(snapshot: Any) -> str:
    if snapshot is None:
        return ""
    if isinstance(snapshot, str):
        return extract_topic_seed(snapshot)
    values = _collect_run_context_values(snapshot)
    return "；".join(values[:3])


def _extract_run_prompt_fields(snapshot: dict[str, Any]) -> list[tuple[str, Any]]:
    prioritized_fields: list[tuple[str, Any]] = []

    def _append_from_mapping(prefix: str, value: Any) -> None:
        if not isinstance(value, dict):
            return
        for key in RUN_CONTEXT_PRIORITY_KEYS:
            if key in value:
                prioritized_fields.append((f"{prefix}_{key}", value.get(key)))

    _append_from_mapping("config", snapshot.get("config"))
    _append_from_mapping("options", snapshot.get("options"))
    _append_from_mapping("request", snapshot.get("request"))
    _append_from_mapping("request_snapshot", snapshot.get("request_snapshot"))
    request_snapshot = snapshot.get("request_snapshot")
    if isinstance(request_snapshot, dict):
        _append_from_mapping("request_config", request_snapshot.get("config"))

    for key in RUN_CONTEXT_PRIORITY_KEYS:
        if key in snapshot:
            prioritized_fields.append((str(key), snapshot.get(key)))
    return prioritized_fields


def extract_run_key_facts(snapshot: Any) -> dict[str, str]:
    facts: dict[str, str] = {}

    def _put(key: str, value: Any) -> None:
        cleaned = extract_topic_seed(value)
        if cleaned and key not in facts:
            facts[key] = cleaned

    if isinstance(snapshot, dict):
        for key, value in _extract_run_prompt_fields(snapshot):
            _put(key, value)
        outline = snapshot.get("outline")
        if isinstance(outline, dict):
            if "title" in outline:
                _put("outline_title", outline.get("title"))
            if "summary" in outline:
                _put("outline_summary", outline.get("summary"))
        for key, value in snapshot.items():
            normalized_key = str(key or "").strip().lower()
            if normalized_key in RUN_CONTEXT_NOISE_KEYS:
                continue
            if normalized_key in RUN_CONTEXT_PRIORITY_KEYS:
                continue
            _put(normalized_key, value)
            if len(facts) >= 5:
                break
    elif snapshot is not None:
        _put("topic", snapshot)

    return facts


def build_run_pending_title(
    *,
    tool_type: str,
    snapshot: Any,
    run_no: int | None,
) -> str:
    if isinstance(snapshot, dict):
        explicit_title = (
            snapshot.get("run_title")
            or snapshot.get("title")
            or snapshot.get("artifact_title")
            or snapshot.get("topic_title")
        )
        explicit_seed = extract_topic_seed(explicit_title)
        if explicit_seed:
            return clean_title_candidate(explicit_seed, max_length=RUN_TITLE_MAX_LENGTH)

    seed = extract_run_context(snapshot)
    tool_label = resolve_tool_label(tool_type)
    if seed:
        return clean_title_candidate(
            f"{seed}{tool_label}", max_length=RUN_TITLE_MAX_LENGTH
        )
    if run_no is not None:
        return build_pending_run_title(run_no, tool_type)
    return clean_title_candidate(
        resolve_tool_label(tool_type), max_length=RUN_TITLE_MAX_LENGTH
    )


def is_generic_title(title: str) -> bool:
    normalized = clean_title_candidate(title, max_length=32)
    return not normalized or normalized in GENERIC_TITLE_TOKENS


def is_bad_run_title(title: str) -> bool:
    normalized = clean_title_candidate(title, max_length=32)
    if not normalized:
        return True
    lowered = normalized.lower()
    return bool(
        ASCII_CONFIG_FRAGMENT_RE.search(normalized)
        or "generation_mode" in lowered
        or "style_preset" in lowered
        or "visual_policy" in lowered
        or normalized.endswith("课程生成")
    )


def stringify_snapshot(snapshot: Any) -> str:
    if snapshot is None:
        return ""
    if isinstance(snapshot, str):
        return snapshot
    try:
        return json.dumps(snapshot, ensure_ascii=False, sort_keys=True)
    except TypeError:
        return str(snapshot)


def build_project_fallback_title(*, description: str, project_id: str | None) -> str:
    return build_default_project_title(project_id)


def build_session_fallback_title(*, first_message: str, session_id: str) -> str:
    return build_default_session_title(session_id)


def build_run_fallback_title(
    *,
    tool_type: str,
    snapshot: Any,
    run_no: int | None,
) -> str:
    return build_run_pending_title(
        tool_type=tool_type,
        snapshot=snapshot,
        run_no=run_no,
    )


def build_project_prompt(description: str) -> str:
    return (
        "你是中文产品命名助手。请为一个教学知识库生成标题。\n"
        "要求：\n"
        "1. 标题像真实知识库名称，不像一句需求。\n"
        "2. 准确体现学科、主题或任务核心，不说空话。\n"
        "3. 不超过16个字。\n"
        "4. 不加引号、不加句号、不输出解释。\n"
        "5. 避免“教学设计/课程生成/新建知识库/项目”等泛词单独成标题。\n"
        f"用户输入：{description.strip()}"
    )


def build_session_prompt(first_message: str) -> str:
    return (
        "你是中文会话标题助手。请根据用户首条教学需求生成会话标题。\n"
        "要求：\n"
        "1. 标题像真实会话名，不像口语请求。\n"
        "2. 突出主题、课题或任务目标。\n"
        "3. 不超过14个字。\n"
        "4. 不加引号、不加句号、不输出解释。\n"
        "5. 避免“帮我/请/生成/会话/新建会话”等废词。\n"
        "6. 只输出标题本身，禁止解释你的思考过程，禁止复述用户要求。\n"
        f"用户消息：{first_message.strip()}"
    )


def build_run_prompt(tool_type: str, snapshot: Any) -> str:
    context = extract_run_context(snapshot)
    return (
        "你是中文运行记录标题助手。请为一次教学工具执行生成标题。\n"
        "要求：\n"
        "1. 标题像历史记录名称，不像系统状态。\n"
        "2. 要体现本次执行的主题、产物或目标。\n"
        "3. 不超过14个字。\n"
        "4. 不加引号、不加句号、不输出解释。\n"
        "5. 避免“处理中/PPT Ready/运行记录/第N次”这类机械词。\n"
        "6. 禁止照抄 generation_mode、style_preset、visual_policy 这类配置键名。\n"
        f"工具：{resolve_tool_label(tool_type)}\n"
        f"主题上下文：{context or '未提取到明确主题'}\n"
        f"原始配置：{stringify_snapshot(snapshot)}"
    )


def _iter_bigrams(value: str) -> list[str]:
    normalized = str(value or "").strip()
    if len(normalized) < 2:
        return []
    return [normalized[index : index + 2] for index in range(len(normalized) - 1)]
