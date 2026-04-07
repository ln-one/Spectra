from __future__ import annotations

import re
from typing import Any

DEFAULT_THEME = {
    "background": "#f5f8f3",
    "panel": "#ffffff",
    "panel_alt": "#e8f6ee",
    "accent": "#16a34a",
    "accent_soft": "#86efac",
    "accent_deep": "#166534",
    "text": "#10231a",
    "muted": "#5f7668",
    "grid": "#d8e7dc",
    "highlight": "#f59e0b",
}

_VISUAL_TYPES = {"process_flow", "relationship_change", "structure_breakdown"}
_NETWORK_LAYER_ORDER = [
    "应用层",
    "传输层",
    "网络层",
    "数据链路层",
    "物理层",
]
_NETWORK_LAYER_DETAILS = {
    "应用层": "直接面向用户应用，负责提供 HTTP、DNS 等网络服务。",
    "传输层": "负责端到端传输，保证数据分段、复用与可靠性控制。",
    "网络层": "负责逻辑寻址与路由，让数据找到目标网络。",
    "数据链路层": "负责相邻节点间成帧、差错检测与介质访问控制。",
    "物理层": "负责把比特转换成电信号、光信号等实际介质上传输的形式。",
}


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _clamp_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(parsed, maximum))


def _split_sentences(text: str) -> list[str]:
    raw = [segment.strip() for segment in re.split(r"[。！？!?；;\n]+", text) if segment]
    return [segment[:90] for segment in raw if segment]


def _split_key_points(text: str) -> list[str]:
    sentences = _split_sentences(text)
    if sentences:
        return sentences[:3]
    parts = [
        segment.strip()
        for segment in re.split(r"[,，/、]+", text)
        if segment and segment.strip()
    ]
    return [segment[:40] for segment in parts[:3]]


def infer_visual_type(content: dict[str, Any]) -> str:
    explicit = _clean_text(content.get("visual_type")).lower()
    if explicit in _VISUAL_TYPES:
        return explicit

    hint_text = " ".join(
        _clean_text(content.get(key))
        for key in ("title", "topic", "summary", "scene", "focus")
    )
    if any(
        token in hint_text
        for token in ("分层", "层次结构", "网络层", "结构", "组成", "部件", "层级", "拆解", "剖面")
    ):
        return "structure_breakdown"
    if any(token in hint_text for token in ("关系", "变化", "趋势", "增减", "影响", "变量")):
        return "relationship_change"
    return "process_flow"


def _extract_network_layers(text: str) -> list[str]:
    found = [layer for layer in _NETWORK_LAYER_ORDER if layer in text]
    if len(found) == len(_NETWORK_LAYER_ORDER):
        return found
    if found and any(token in text for token in ("计算机网络", "分层", "层次", "层次结构", "网络层")):
        return list(_NETWORK_LAYER_ORDER)
    if "计算机网络" in text and any(token in text for token in ("分层", "层次", "层次结构", "网络层")):
        return list(_NETWORK_LAYER_ORDER)
    return []


def _extract_structure_parts(title: str, summary: str, focus: str) -> list[str]:
    combined = " ".join(item for item in (title, summary, focus) if item)
    network_layers = _extract_network_layers(combined)
    if network_layers:
        return network_layers

    parts = [
        segment.strip("：: ")
        for segment in re.split(r"[、,，/→]|以及|和|与", combined)
        if segment and segment.strip()
    ]
    cleaned: list[str] = []
    for part in parts:
        if len(part) > 2 and len(part) <= 12 and any(ch.isalpha() or "\u4e00" <= ch <= "\u9fff" for ch in part):
            if part not in cleaned:
                cleaned.append(part)
    return cleaned[:5]


def _build_object_details(parts: list[str]) -> list[dict[str, str]]:
    details: list[dict[str, str]] = []
    for item in parts:
        details.append(
            {
                "label": item,
                "role": _NETWORK_LAYER_DETAILS.get(item, f"{item} 是该结构中的关键组成部分。"),
            }
        )
    return details


def _default_scenes(
    *,
    title: str,
    summary: str,
    focus: str,
    visual_type: str,
) -> list[dict[str, Any]]:
    focus_points = _split_key_points(focus) or _split_key_points(summary)
    summary_points = _split_key_points(summary)
    if visual_type == "relationship_change":
        return [
            {
                "title": "先看变化对象",
                "description": summary or f"说明 {title} 中哪些量在变化。",
                "emphasis": focus_points[0] if focus_points else "先定义变量和观察维度",
            },
            {
                "title": "突出关键拐点",
                "description": (
                    focus_points[1]
                    if len(focus_points) > 1
                    else "强调上升、下降或转折出现的位置。"
                ),
                "emphasis": "不要平均展示所有阶段",
            },
            {
                "title": "给出教学结论",
                "description": (
                    summary_points[0]
                    if summary_points
                    else f"把 {title} 的变化规律落回课堂结论。"
                ),
                "emphasis": focus_points[-1] if focus_points else "结论要便于教师口头解释",
            },
        ]
    if visual_type == "structure_breakdown":
        structure_parts = _extract_structure_parts(title, summary, focus)
        if structure_parts:
            lead = " -> ".join(structure_parts[:5])
            structure_details = _build_object_details(structure_parts)
            return [
                {
                    "title": "先看整体结构",
                    "description": (
                        f"先建立整体框架：{lead}。让学生先知道每一层都在整体通信中承担不同职责。"
                    ),
                    "emphasis": "先看到整体分层，不急着讲细节",
                    "key_points": [
                        "先看五层整体顺序",
                        "理解每层各司其职",
                        "建立自上而下的整体印象",
                    ],
                    "focus_sequence": structure_parts,
                },
                {
                    "title": "逐层展开关键部分",
                    "description": (
                        "按顺序突出应用层、传输层、网络层、数据链路层和物理层的职责差异。"
                    ),
                    "emphasis": "当前层高亮，其他层弱化",
                    "key_points": [
                        detail["label"] + "：" + detail["role"][:18]
                        for detail in structure_details[:3]
                    ],
                    "focus_sequence": structure_parts,
                },
                {
                    "title": "回到层间协作",
                    "description": (
                        f"总结这些层如何共同完成 {title} 的整体工作，强调数据是如何自上而下封装、再逐层传递的。"
                    ),
                    "emphasis": "把结构意义落回课堂结论",
                    "key_points": [
                        "发送时自上而下逐层处理",
                        "接收时再按层还原信息",
                        "分层让网络设计更清晰可维护",
                    ],
                    "focus_sequence": structure_parts,
                },
            ]
        return [
            {
                "title": "整体结构",
                "description": summary or f"先展示 {title} 的整体结构。",
                "emphasis": focus_points[0] if focus_points else "先让学生建立整体印象",
            },
            {
                "title": "拆解关键部分",
                "description": (
                    focus_points[1]
                    if len(focus_points) > 1
                    else "依次突出最重要的两个或三个组成部分。"
                ),
                "emphasis": "强调组成关系和作用差异",
            },
            {
                "title": "回到结构意义",
                "description": (
                    summary_points[0]
                    if summary_points
                    else "说明各部分如何共同支撑整体功能。"
                ),
                "emphasis": focus_points[-1] if focus_points else "形成便于记忆的结构结论",
            },
        ]
    return [
        {
            "title": "引入主题",
            "description": summary or f"说明这段动画为什么要讲 {title}。",
            "emphasis": focus_points[0] if focus_points else "先让学生知道要看什么",
        },
        {
            "title": "展开关键过程",
            "description": (
                focus_points[1]
                if len(focus_points) > 1
                else "按步骤突出阶段切换、条件变化和因果关系。"
            ),
            "emphasis": "关键步骤要明显，避免平均分配篇幅",
        },
        {
            "title": "收束到结论",
            "description": (
                summary_points[0]
                if summary_points
                else f"总结 {title} 的关键机制和课堂落点。"
            ),
            "emphasis": focus_points[-1] if focus_points else "结论要便于教师插入讲解",
        },
    ]


def _normalize_scene(
    raw_scene: Any,
    *,
    index: int,
    title: str,
    focus: str,
) -> dict[str, Any]:
    if not isinstance(raw_scene, dict):
        return {
            "id": f"scene-{index}",
            "title": f"镜头 {index}",
            "description": _clean_text(raw_scene) or f"{title} 的第 {index} 个镜头",
            "emphasis": _clean_text(focus),
            "key_points": [],
        }

    scene_title = _clean_text(raw_scene.get("title")) or f"镜头 {index}"
    description = (
        _clean_text(raw_scene.get("description"))
        or _clean_text(raw_scene.get("summary"))
        or _clean_text(raw_scene.get("caption"))
        or f"{title} 的第 {index} 个镜头"
    )
    emphasis = _clean_text(raw_scene.get("emphasis")) or _clean_text(
        raw_scene.get("focus")
    )
    if not emphasis:
        emphasis = _clean_text(focus)
    key_points = raw_scene.get("key_points")
    if not isinstance(key_points, list):
        key_points = _split_key_points(description)
    else:
        key_points = [_clean_text(item) for item in key_points if _clean_text(item)]

    return {
        "id": _clean_text(raw_scene.get("id")) or f"scene-{index}",
        "title": scene_title,
        "description": description,
        "emphasis": emphasis,
        "key_points": key_points[:3],
        "focus_sequence": [
            _clean_text(item)
            for item in (raw_scene.get("focus_sequence") or [])
            if _clean_text(item)
        ],
    }


def normalize_animation_spec(content: dict[str, Any]) -> dict[str, Any]:
    title = _clean_text(content.get("title")) or "教学动画"
    topic = _clean_text(content.get("topic")) or title
    summary = _clean_text(content.get("summary")) or _clean_text(content.get("scene"))
    focus = _clean_text(content.get("focus")) or _clean_text(content.get("motion_brief"))
    duration_seconds = _clamp_int(
        content.get("duration_seconds"), default=6, minimum=3, maximum=20
    )
    rhythm = _clean_text(content.get("rhythm")).lower() or "balanced"
    if rhythm not in {"slow", "balanced", "fast"}:
        rhythm = "balanced"

    visual_type = infer_visual_type(content)
    raw_scenes = content.get("scenes")
    normalized_scenes = [
        _normalize_scene(scene, index=index, title=title, focus=focus)
        for index, scene in enumerate(raw_scenes or [], start=1)
    ]
    if not normalized_scenes:
        normalized_scenes = [
            _normalize_scene(scene, index=index, title=title, focus=focus)
            for index, scene in enumerate(
                _default_scenes(
                    title=title,
                    summary=summary,
                    focus=focus,
                    visual_type=visual_type,
                ),
                start=1,
            )
        ]

    teaching_goal = (
        _clean_text(content.get("teaching_goal"))
        or focus
        or summary
        or f"帮助学生理解 {topic} 的关键知识点。"
    )

    spec = {
        "title": title,
        "topic": topic,
        "summary": summary,
        "teaching_goal": teaching_goal,
        "focus": focus,
        "visual_type": visual_type,
        "duration_seconds": duration_seconds,
        "rhythm": rhythm,
        "theme": dict(DEFAULT_THEME),
        "scenes": normalized_scenes,
        "objects": [],
        "object_details": [],
    }
    if visual_type == "structure_breakdown":
        parts = _extract_structure_parts(title, summary, focus)
        spec["objects"] = parts
        spec["object_details"] = _build_object_details(parts)
    return spec
