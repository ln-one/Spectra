from __future__ import annotations

from typing import Any

from services.generation_session_service.run_constants import resolve_tool_label

from .prompting import (
    RUN_TITLE_MAX_LENGTH,
    TITLE_MIN_LENGTH,
    clean_title_candidate,
    extract_run_context,
    extract_run_key_facts,
    extract_topic_seed,
    normalize_text,
)


def build_project_title_payload(description: str) -> dict[str, Any]:
    seed = extract_topic_seed(description)
    return {
        "scene": "project",
        "scene_label": "教学知识库",
        "title_rules": {
            "language": "zh-CN",
            "min_chars": TITLE_MIN_LENGTH,
            "max_chars": 20,
        },
        "key_facts": {
            "description_seed": seed,
            "description_text": normalize_text(description)[:200],
        },
    }


def build_session_title_payload(first_message: str) -> dict[str, Any]:
    seed = extract_topic_seed(first_message)
    return {
        "scene": "session",
        "scene_label": "教学会话",
        "title_rules": {
            "language": "zh-CN",
            "min_chars": TITLE_MIN_LENGTH,
            "max_chars": 20,
        },
        "key_facts": {
            "first_message_seed": seed,
            "first_message_text": normalize_text(first_message)[:200],
        },
    }


def build_run_title_payload(tool_type: str, snapshot: Any) -> dict[str, Any]:
    key_facts = extract_run_key_facts(snapshot)
    key_facts["tool_label"] = clean_title_candidate(
        resolve_tool_label(tool_type),
        max_length=RUN_TITLE_MAX_LENGTH,
    )
    return {
        "scene": "run",
        "scene_label": resolve_tool_label(tool_type),
        "title_rules": {
            "language": "zh-CN",
            "min_chars": TITLE_MIN_LENGTH,
            "max_chars": 20,
        },
        "key_facts": key_facts,
        "context_summary": extract_run_context(snapshot),
    }


def build_structured_title_system_prompt(scene: str) -> str:
    normalized_scene = str(scene or "").strip().lower()
    scene_hint = {
        "project": "一个长期教学知识库",
        "session": "一次教学会话",
        "run": "一次教学工具执行记录",
    }.get(normalized_scene, "一个教学标题")
    return (
        "你是中文标题命名助手。\n"
        f"当前需要为{scene_hint}生成标题。\n"
        "你必须调用 set_title 函数返回结果，禁止输出自然语言解释。\n"
        "如果工具调用以文本形式输出，必须使用 <tool_calls> 包裹单个 JSON 对象："
        '{"name":"set_title","arguments":{"title":"...","basis_key":"...","scene":"..."}}'
        "</tool_calls>。\n"
        "规则：\n"
        "1. 标题必须是 5 到 20 个中文可见字符。\n"
        "2. 标题必须基于 key_facts 中某一个关键信息，并在 basis_key 中明确指出使用了哪个键。\n"
        "3. 标题必须像真实标题，不能是系统状态、配置键名、思考过程或提示词复述。\n"
        "4. 禁止返回“课件生成/课程生成/新建会话/新建知识库/运行记录”等泛标题。\n"
        "5. 除工具调用协议外，禁止返回任何解释、分析、前后缀标签、引号、JSON 文本或 Markdown。"
    )
