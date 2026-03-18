from __future__ import annotations

import json
import os
import re
import uuid
from typing import Optional

_ARTIFACT_TYPE_TO_CAPABILITY = {
    "pptx": "ppt",
    "docx": "word",
    "mindmap": "mindmap",
    "summary": "summary",
    "exercise": "quiz",
    "html": "animation",
}

_OUTLINE_STYLE_RULES = {
    "structured": (
        "采用“总-分-总”结构：导入总览 -> 分章节展开 -> 结语总结；"
        "章节标题体现层级关系，优先使用概念递进。"
    ),
    "story": (
        "采用叙事引导结构：情境引入 -> 冲突/问题出现 -> 知识揭示 -> 迁移应用；"
        "每章保持故事线连续。"
    ),
    "problem": (
        "采用问题驱动结构：每章以问题开场，随后给出分析路径、结论与小练习；"
        "问题之间应形成问题链。"
    ),
    "workshop": (
        "采用实操工作坊结构：任务目标 -> 操作步骤 -> 案例演示 -> 练习复盘；"
        "强调可执行步骤与课堂活动。"
    ),
}


def _extract_outline_style(options: Optional[dict]) -> Optional[str]:
    """Extract outline style id from session options or prompt tone text."""
    if not options:
        return None

    explicit = str(options.get("outline_style") or "").strip().lower()
    if explicit in _OUTLINE_STYLE_RULES:
        return explicit

    tone = str(options.get("system_prompt_tone") or "")
    if not tone:
        return None

    token_match = re.search(
        r"\[\s*outline_style\s*=\s*(structured|story|problem|workshop)\s*\]",
        tone,
        re.IGNORECASE,
    )
    if token_match:
        return token_match.group(1).lower()

    if any(keyword in tone for keyword in ("总-分-总", "总分总", "层次分明")):
        return "structured"
    if any(keyword in tone for keyword in ("叙事", "故事", "情境引入")):
        return "story"
    if any(keyword in tone for keyword in ("问题驱动", "问题链", "启发式")):
        return "problem"
    if any(keyword in tone for keyword in ("实操", "工作坊", "案例化", "可落地")):
        return "workshop"

    return None


def _build_outline_requirements(
    project,
    options: Optional[dict],
) -> str:
    """Build outline requirements text from project info + generation options."""
    parts = []
    if project:
        if getattr(project, "name", None):
            parts.append(f"项目名称：{project.name}")
        if getattr(project, "description", None):
            parts.append(f"项目描述：{project.description}")

    if options:
        if options.get("system_prompt_tone"):
            parts.append(f"用户需求：{options['system_prompt_tone']}")
        if options.get("pages"):
            parts.append(f"目标页数：{options['pages']}")
        if options.get("audience"):
            parts.append(f"目标受众：{options['audience']}")
        if options.get("target_duration_minutes"):
            parts.append(f"目标时长：{options['target_duration_minutes']} 分钟")
        outline_style = _extract_outline_style(options)
        if outline_style:
            parts.append(f"大纲风格ID：{outline_style}")
            parts.append("大纲风格硬约束（必须遵循）：")
            parts.append(_OUTLINE_STYLE_RULES[outline_style])

    return "\n".join(parts).strip() or "生成课件大纲"


def _courseware_outline_to_document(
    outline, target_pages: Optional[int] = None
) -> dict:
    """Map CoursewareOutline to OutlineDocument schema."""
    nodes = []
    order = 1
    for section in outline.sections:
        count = section.slide_count or 1
        for idx in range(count):
            title = section.title if count == 1 else f"{section.title}（{idx + 1}）"
            nodes.append(
                {
                    "id": str(uuid.uuid4()),
                    "order": order,
                    "title": title,
                    "key_points": list(section.key_points or []),
                    "estimated_minutes": None,
                }
            )
            order += 1

    if target_pages and len(nodes) < target_pages:
        while len(nodes) < target_pages:
            nodes.append(
                {
                    "id": str(uuid.uuid4()),
                    "order": order,
                    "title": f"补充内容 {order}",
                    "key_points": [],
                    "estimated_minutes": None,
                }
            )
            order += 1

    return {
        "version": 1,
        "nodes": nodes,
        "summary": getattr(outline, "summary", None),
    }


def _parse_json_object(raw: Optional[str]) -> dict:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _resolve_capability_from_artifact(artifact_type: str, metadata: dict) -> str:
    normalized_type = str(artifact_type or "").strip().lower()
    metadata_kind = str((metadata or {}).get("kind") or "").strip().lower()

    if normalized_type == "summary" and metadata_kind == "outline":
        return "outline"
    if normalized_type == "docx" and metadata_kind == "handout":
        return "handout"
    if normalized_type == "html" and metadata_kind == "animation_storyboard":
        return "animation"
    if normalized_type in _ARTIFACT_TYPE_TO_CAPABILITY:
        return _ARTIFACT_TYPE_TO_CAPABILITY[normalized_type]
    return normalized_type or "unknown"


def _default_capabilities() -> list[dict]:
    """返回能力声明列表，集成真实健康检查。"""
    from services.capability_health import get_all_capabilities_health

    health_status = get_all_capabilities_health()

    doc_parser_health = health_status.get("document_parser")
    video_health = health_status.get("video_understanding")
    speech_health = health_status.get("speech_recognition")

    default_model = os.getenv("DEFAULT_MODEL", "qwen3.5-plus")
    llm_provider = (
        default_model.split("/", 1)[0] if "/" in default_model else default_model
    )

    return [
        {
            "name": "outline_generation",
            "status": "available",
            "providers": [llm_provider],
            "default_provider": llm_provider,
            "fallback_chain": [],
            "operations": ["draft", "redraft", "confirm"],
            "status_message": None,
        },
        {
            "name": "document_parser",
            "status": (
                doc_parser_health.status.value if doc_parser_health else "unavailable"
            ),
            "providers": [doc_parser_health.provider] if doc_parser_health else [],
            "default_provider": (
                doc_parser_health.provider if doc_parser_health else None
            ),
            "fallback_chain": (
                [doc_parser_health.fallback_target]
                if (
                    doc_parser_health
                    and doc_parser_health.fallback_used
                    and doc_parser_health.fallback_target
                )
                else []
            ),
            "operations": ["parse"],
            "status_message": (
                doc_parser_health.user_message if doc_parser_health else None
            ),
        },
        {
            "name": "video_understanding",
            "status": video_health.status.value if video_health else "unavailable",
            "providers": [video_health.provider] if video_health else [],
            "default_provider": video_health.provider if video_health else None,
            "fallback_chain": (
                [video_health.fallback_target]
                if (
                    video_health
                    and video_health.fallback_used
                    and video_health.fallback_target
                )
                else []
            ),
            "operations": ["understand"],
            "status_message": video_health.user_message if video_health else None,
        },
        {
            "name": "speech_recognition",
            "status": speech_health.status.value if speech_health else "unavailable",
            "providers": [speech_health.provider] if speech_health else [],
            "default_provider": speech_health.provider if speech_health else None,
            "fallback_chain": (
                [speech_health.fallback_target]
                if (
                    speech_health
                    and speech_health.fallback_used
                    and speech_health.fallback_target
                )
                else []
            ),
            "operations": ["transcribe"],
            "status_message": speech_health.user_message if speech_health else None,
        },
        {
            "name": "slide_regeneration",
            "status": "available",
            "providers": [llm_provider],
            "default_provider": llm_provider,
            "fallback_chain": [],
            "operations": ["regenerate"],
            "status_message": None,
        },
        {
            "name": "event_stream",
            "status": "available",
            "providers": ["sse"],
            "default_provider": "sse",
            "fallback_chain": ["polling"],
            "operations": ["subscribe"],
            "status_message": None,
        },
    ]
