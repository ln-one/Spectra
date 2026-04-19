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

LEADING_NOISE_RE = re.compile(
    r"^(请|帮我|麻烦|我想|我要|需要|希望|准备|帮忙|做一个|生成一个|创建一个|新建一个)+"
)
TRAILING_PUNCT_RE = re.compile(r"[。；;，,：:\-—_~!！?？]+$")


def normalize_text(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    return re.sub(r"\s+", " ", text)


def clean_title_candidate(value: Any, *, max_length: int) -> str:
    title = normalize_text(value)
    if not title:
        return ""
    title = title.replace("\n", " ").replace("\r", " ").strip()
    title = re.sub(r"^['\"“”‘’`#*\-]+", "", title)
    title = TRAILING_PUNCT_RE.sub("", title)
    title = re.sub(r"\s+", " ", title).strip()
    return title[:max_length].strip()


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


def is_generic_title(title: str) -> bool:
    normalized = clean_title_candidate(title, max_length=32)
    return not normalized or normalized in GENERIC_TITLE_TOKENS


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
    seed = extract_topic_seed(description)
    if seed:
        return clean_title_candidate(
            f"{seed}教学库", max_length=PROJECT_TITLE_MAX_LENGTH
        )
    return build_default_project_title(project_id)


def build_session_fallback_title(*, first_message: str, session_id: str) -> str:
    seed = extract_topic_seed(first_message)
    if seed:
        return clean_title_candidate(
            f"{seed}备课会话", max_length=SESSION_TITLE_MAX_LENGTH
        )
    return build_default_session_title(session_id)


def build_run_fallback_title(
    *,
    tool_type: str,
    snapshot: Any,
    run_no: int | None,
) -> str:
    seed = extract_topic_seed(stringify_snapshot(snapshot))
    tool_label = resolve_tool_label(tool_type)
    if seed:
        return clean_title_candidate(
            f"{seed}{tool_label}", max_length=RUN_TITLE_MAX_LENGTH
        )
    if run_no is not None:
        return build_pending_run_title(run_no, tool_type)
    return clean_title_candidate(tool_label, max_length=RUN_TITLE_MAX_LENGTH)


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
        f"用户消息：{first_message.strip()}"
    )


def build_run_prompt(tool_type: str, snapshot: Any) -> str:
    return (
        "你是中文运行记录标题助手。请为一次教学工具执行生成标题。\n"
        "要求：\n"
        "1. 标题像历史记录名称，不像系统状态。\n"
        "2. 要体现本次执行的主题、产物或目标。\n"
        "3. 不超过14个字。\n"
        "4. 不加引号、不加句号、不输出解释。\n"
        "5. 避免“处理中/PPT Ready/运行记录/第N次”这类机械词。\n"
        f"工具：{resolve_tool_label(tool_type)}\n"
        f"上下文：{stringify_snapshot(snapshot)}"
    )
