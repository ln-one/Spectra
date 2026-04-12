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
_TEACHING_PPT_CARTOON_THEME = {
    "background": "#f3c453",
    "panel": "#fff1cc",
    "panel_alt": "#f7d98b",
    "accent": "#1f7a5c",
    "accent_soft": "#63b99a",
    "accent_deep": "#17334e",
    "text": "#1f2430",
    "muted": "#5f4f3d",
    "grid": "#e8c978",
    "highlight": "#c2663f",
}

_STYLE_PACK_THEMES = {
    "teaching_ppt_cartoon": _TEACHING_PPT_CARTOON_THEME,
    "teaching_ppt_fresh_green": DEFAULT_THEME,
}
_STYLE_PACK_ALIASES = {
    "default": "teaching_ppt_cartoon",
    "teaching_ppt": "teaching_ppt_cartoon",
    "cartoon": "teaching_ppt_cartoon",
    "fresh_green": "teaching_ppt_fresh_green",
}
_DEFAULT_STYLE_PACK = "teaching_ppt_cartoon"

_VISUAL_TYPES = {"process_flow", "relationship_change", "structure_breakdown"}
_SUBJECT_FAMILIES = {
    "generic_process",
    "protocol_exchange",
    "pipeline_sequence",
    "lifecycle_cycle",
    "traversal_path",
    "energy_transfer",
    "structure_layers",
    "trend_change",
}
_LAYOUT_TYPES = {
    "two_party_sequence",
    "horizontal_pipeline",
    "cycle_stages",
    "traversal_map",
    "energy_track",
    "layer_stack",
    "trend_curve",
}
_NETWORK_LAYER_ORDER = [
    "应用层",
    "传输层",
    "网络层",
    "数据链路层",
    "物理层",
]
_OSI_LAYER_ORDER = [
    "应用层",
    "表示层",
    "会话层",
    "传输层",
    "网络层",
    "数据链路层",
    "物理层",
]
_NETWORK_LAYER_DETAILS = {
    "应用层": "直接面向用户应用，负责提供 HTTP、DNS 等网络服务。",
    "表示层": "负责数据表示、编码转换、压缩和加密，让不同系统能正确理解数据。",
    "会话层": "负责建立、维持和管理会话，让通信双方保持有序交互。",
    "传输层": "负责端到端传输，保证数据分段、复用与可靠性控制。",
    "网络层": "负责逻辑寻址与路由，让数据找到目标网络。",
    "数据链路层": "负责相邻节点间成帧、差错检测与介质访问控制。",
    "物理层": "负责把比特转换成电信号、光信号等实际介质上传输的形式。",
}
_SCENE_TRANSITIONS = {
    "cut",
    "dissolve",
    "soft_wipe",
    "blinds",
    "shutter",
    "fade",
    "slide",
    "zoom",
    "wipe",
}
_SCENE_TRANSITION_ALIASES = {
    "fade": "dissolve",
    "slide": "soft_wipe",
    "zoom": "dissolve",
    "wipe": "soft_wipe",
    "softwipe": "soft_wipe",
}
_DEFAULT_SCENE_TRANSITION_ORDER = ("cut", "dissolve", "soft_wipe", "blinds")
_SHOT_TYPES = {"intro", "focus", "summary"}
_CAMERA_TYPES = {
    "wide",
    "medium",
    "close",
    "track_left",
    "track_right",
    "zoom_in",
    "zoom_out",
}
_REQUEST_PREFIXES = (
    "请给我制作一个",
    "请给我制作",
    "请帮我制作一个",
    "请帮我制作",
    "帮我制作一个",
    "帮我制作",
    "请生成一个",
    "请生成",
    "给我做一个",
    "给我做",
    "我想做一个",
    "我想做",
    "我想要一个",
    "我想要",
    "请做一个",
    "请做",
)
_REQUEST_PATTERN = re.compile(
    r"^(请|帮我|给我|我想|想要|麻烦|请帮我|请给我).*(做|制作|生成|输出|创建).*(动画|演示|GIF|gif)",
    re.IGNORECASE,
)


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _sanitize_display_copy(value: Any) -> str:
    content = _clean_text(value)
    if not content:
        return ""
    if _REQUEST_PATTERN.search(content):
        return ""
    normalized = content
    for prefix in _REQUEST_PREFIXES:
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix) :].lstrip("：:，,。 ")
            break
    normalized = normalized.strip("：:，,。 ")
    if not normalized:
        return ""
    if _REQUEST_PATTERN.search(normalized):
        return ""
    return normalized


def _clamp_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(parsed, maximum))


def _split_sentences(text: str) -> list[str]:
    raw = [
        segment.strip() for segment in re.split(r"[。！？!?；;\n]+", text) if segment
    ]
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


def _clip_text(text: str, *, maximum: int) -> str:
    content = _clean_text(text)
    if len(content) <= maximum:
        return content
    return content[: maximum - 1].rstrip() + "…"


def _normalize_transition(value: Any, *, index: int) -> str:
    candidate = _clean_text(value).lower()
    candidate = _SCENE_TRANSITION_ALIASES.get(candidate, candidate)
    if candidate in _SCENE_TRANSITIONS:
        return candidate
    return _DEFAULT_SCENE_TRANSITION_ORDER[
        (index - 1) % len(_DEFAULT_SCENE_TRANSITION_ORDER)
    ]


def _resolve_scene_budget(
    *,
    duration_seconds: int,
    visual_type: str,
    complexity: int,
) -> int:
    if duration_seconds <= 6:
        return 3
    if duration_seconds <= 10:
        if visual_type == "structure_breakdown":
            return 4 if complexity >= 5 else 3
        return 4 if complexity >= 4 else 3
    if visual_type == "structure_breakdown":
        return 5 if complexity >= 5 else 4
    return 5 if complexity >= 4 else 4


def _parse_scene_count_token(token: str) -> int | None:
    raw = _clean_text(token)
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        pass
    chinese_map = {
        "一": 1,
        "二": 2,
        "两": 2,
        "三": 3,
        "四": 4,
        "五": 5,
        "六": 6,
        "七": 7,
        "八": 8,
        "九": 9,
        "十": 10,
    }
    if raw == "十":
        return 10
    if raw.startswith("十"):
        tail = chinese_map.get(raw[1:], 0)
        return 10 + tail
    if "十" in raw:
        left, _, right = raw.partition("十")
        left_num = chinese_map.get(left, 1)
        right_num = chinese_map.get(right, 0)
        return left_num * 10 + right_num
    return chinese_map.get(raw)


def _extract_scene_count_constraint(*texts: str) -> int | None:
    combined = " ".join(_clean_text(item) for item in texts if _clean_text(item))
    if not combined:
        return None
    patterns = (
        r"(?:至少|最少|不少于|不低于)\s*([0-9一二三四五六七八九十两]{1,3})\s*段",
        r"(?:分成|拆成|做成|共|一共)\s*([0-9一二三四五六七八九十两]{1,3})\s*段",
        r"([0-9一二三四五六七八九十两]{1,3})\s*段(?:动画|镜头|流程|展示)",
    )
    for pattern in patterns:
        matched = re.search(pattern, combined)
        if not matched:
            continue
        parsed = _parse_scene_count_token(matched.group(1))
        if parsed is not None:
            return _clamp_int(parsed, default=3, minimum=1, maximum=12)
    return None


def _resolve_style_pack(value: Any) -> str:
    raw = _clean_text(value).lower()
    if raw in _STYLE_PACK_THEMES:
        return raw
    if raw in _STYLE_PACK_ALIASES:
        mapped = _STYLE_PACK_ALIASES[raw]
        if mapped in _STYLE_PACK_THEMES:
            return mapped
    return _DEFAULT_STYLE_PACK


def _resolve_scene_camera(value: Any, *, shot_type: str, index: int) -> str:
    candidate = _clean_text(value).lower()
    if candidate in _CAMERA_TYPES:
        return candidate
    if shot_type == "intro":
        return "wide"
    if shot_type == "summary":
        return "zoom_out"
    focus_cameras = ("medium", "close", "track_left", "track_right", "zoom_in")
    return focus_cameras[(index - 1) % len(focus_cameras)]


def _resolve_theme(style_pack: str, custom_theme: Any) -> dict[str, str]:
    base = dict(
        _STYLE_PACK_THEMES.get(style_pack) or _STYLE_PACK_THEMES[_DEFAULT_STYLE_PACK]
    )
    if isinstance(custom_theme, dict):
        for key, value in custom_theme.items():
            if key in base:
                normalized = _clean_text(value)
                if normalized:
                    base[key] = normalized
    return base


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
        for token in (
            "分层",
            "层次结构",
            "网络层",
            "结构",
            "组成",
            "部件",
            "层级",
            "拆解",
            "剖面",
            "osi",
            "OSI",
            "七层模型",
            "封装",
            "解封装",
        )
    ):
        return "structure_breakdown"
    if any(
        token in hint_text for token in ("关系", "变化", "趋势", "增减", "影响", "变量")
    ):
        return "relationship_change"
    return "process_flow"


def _extract_network_layers(text: str) -> list[str]:
    if any(token in text for token in ("OSI", "osi", "七层模型")):
        return list(_OSI_LAYER_ORDER)
    found = [layer for layer in _NETWORK_LAYER_ORDER if layer in text]
    if len(found) == len(_NETWORK_LAYER_ORDER):
        return found
    if found and any(
        token in text for token in ("计算机网络", "分层", "层次", "层次结构", "网络层")
    ):
        return list(_NETWORK_LAYER_ORDER)
    if "计算机网络" in text and any(
        token in text for token in ("分层", "层次", "层次结构", "网络层")
    ):
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
        if (
            len(part) > 2
            and len(part) <= 12
            and any(ch.isalpha() or "\u4e00" <= ch <= "\u9fff" for ch in part)
        ):
            if part not in cleaned:
                cleaned.append(part)
    return cleaned[:5]


def _build_object_details(parts: list[str]) -> list[dict[str, str]]:
    details: list[dict[str, str]] = []
    for item in parts:
        details.append(
            {
                "label": item,
                "role": _NETWORK_LAYER_DETAILS.get(
                    item, f"{item} 是该结构中的关键组成部分。"
                ),
            }
        )
    return details


def infer_subject_family(content: dict[str, Any], visual_type: str) -> str:
    explicit = _clean_text(content.get("subject_family")).lower()
    if explicit in _SUBJECT_FAMILIES:
        return explicit

    text = " ".join(
        _clean_text(content.get(key))
        for key in ("title", "topic", "summary", "scene", "focus", "teaching_goal")
    ).lower()
    upper_text = text.upper()

    if visual_type == "relationship_change":
        return "trend_change"
    if visual_type == "structure_breakdown":
        return "structure_layers"
    if (
        "TCP" in upper_text
        or "HTTP" in upper_text
        or "DNS" in upper_text
        or "UDP" in upper_text
        or "握手" in text
        or "请求响应" in text
        or "通信" in text
        or "交互" in text
    ):
        return "protocol_exchange"
    if (
        "遍历" in text
        or "搜索" in text
        or "查找" in text
        or "dfs" in upper_text
        or "bfs" in upper_text
        or "二叉树" in text
        or "图" in text
        or "路径" in text
    ):
        return "traversal_path"
    if (
        "能量" in text
        or "电流" in text
        or "传导" in text
        or "转换" in text
        or "充电" in text
        or "发射" in text
        or "升空" in text
    ):
        return "energy_transfer"
    if (
        "生长" in text
        or "周期" in text
        or "生命周期" in text
        or "分裂" in text
        or "开花" in text
        or "发芽" in text
        or "成熟" in text
    ):
        return "lifecycle_cycle"
    if (
        "流程" in text
        or "事务" in text
        or "订单" in text
        or "执行" in text
        or "生产" in text
        or "编译" in text
        or "管线" in text
        or "阶段" in text
    ):
        return "pipeline_sequence"
    return "generic_process"


def infer_layout_type(subject_family: str, visual_type: str) -> str:
    if subject_family == "protocol_exchange":
        return "two_party_sequence"
    if subject_family == "traversal_path":
        return "traversal_map"
    if subject_family == "energy_transfer":
        return "energy_track"
    if subject_family == "lifecycle_cycle":
        return "cycle_stages"
    if subject_family == "structure_layers":
        return "layer_stack"
    if subject_family == "trend_change":
        return "trend_curve"
    return "horizontal_pipeline"


def _build_semantic_objects(
    *,
    title: str,
    summary: str,
    focus: str,
    subject_family: str,
    visual_type: str,
    scenes: list[dict[str, Any]],
) -> list[dict[str, str]]:
    if subject_family == "structure_layers":
        return [
            {
                "id": f"layer_{index + 1}",
                "label": detail["label"],
                "kind": "layer",
                "role": detail["role"],
            }
            for index, detail in enumerate(
                _build_object_details(_extract_structure_parts(title, summary, focus))
            )
        ]

    if subject_family == "protocol_exchange":
        text = f"{title} {summary} {focus}".upper()
        left_label = "客户端"
        right_label = "服务端"
        if "HTTP" in text:
            left_label = "浏览器"
            right_label = "服务端"
        elif "订单" in f"{title}{summary}{focus}":
            left_label = "用户端"
            right_label = "交易服务"
        packet_label = "数据包"
        if "SYN" in text and "ACK" in text:
            packet_label = "握手报文"
        elif "HTTP" in text:
            packet_label = "请求报文"
        return [
            {
                "id": "actor_left",
                "label": left_label,
                "kind": "endpoint",
                "role": "发起或接收关键交互的一侧。",
            },
            {
                "id": "actor_right",
                "label": right_label,
                "kind": "endpoint",
                "role": "对交互进行响应并完成状态转换的一侧。",
            },
            {
                "id": "payload",
                "label": packet_label,
                "kind": "payload",
                "role": "沿通信链路往返传递的核心对象。",
            },
        ]

    if subject_family == "traversal_path":
        labels: list[str] = []
        for scene in scenes:
            for item in scene.get("focus_sequence") or []:
                cleaned = _clean_text(item)
                if cleaned and cleaned not in labels:
                    labels.append(cleaned)
        if not labels:
            labels = ["起始节点", "中间节点", "目标节点", "结果序列"]
        return [
            {
                "id": f"node_{index + 1}",
                "label": label,
                "kind": "node",
                "role": "遍历路径中的关键停靠点。",
            }
            for index, label in enumerate(labels[:6])
        ]

    if subject_family == "energy_transfer":
        return [
            {
                "id": "source",
                "label": "能量源",
                "kind": "source",
                "role": "系统中提供初始能量或驱动力的对象。",
            },
            {
                "id": "carrier",
                "label": "传递通道",
                "kind": "channel",
                "role": "承载能量向下游移动的中间链路。",
            },
            {
                "id": "converter",
                "label": "转换单元",
                "kind": "converter",
                "role": "将能量形态转换为目标输出形式。",
            },
            {
                "id": "output",
                "label": "输出结果",
                "kind": "output",
                "role": "最终被用户感知到的运动、驱动或状态变化。",
            },
        ]

    if subject_family == "lifecycle_cycle":
        stage_labels = [
            _clean_text(scene.get("title")) or f"阶段 {index + 1}"
            for index, scene in enumerate(scenes[:6])
        ]
        return [
            {
                "id": f"stage_{index + 1}",
                "label": label,
                "kind": "stage",
                "role": "生命周期中的一个连续阶段。",
            }
            for index, label in enumerate(stage_labels)
        ]

    if visual_type == "relationship_change":
        return [
            {
                "id": "baseline",
                "label": "起始值",
                "kind": "point",
                "role": "变化开始前的初始状态。",
            },
            {
                "id": "turning_point",
                "label": "拐点",
                "kind": "point",
                "role": "趋势转折或变化最明显的关键位置。",
            },
            {
                "id": "conclusion",
                "label": "结论段",
                "kind": "point",
                "role": "将趋势回收为课堂知识结论。",
            },
        ]

    stage_labels = [
        _clean_text(scene.get("title")) or f"步骤 {index + 1}"
        for index, scene in enumerate(scenes[:6])
    ]
    return [
        {
            "id": f"step_{index + 1}",
            "label": label,
            "kind": "step",
            "role": "流程推进中的一个关键步骤。",
        }
        for index, label in enumerate(stage_labels)
    ]


def _enrich_scene_semantics(
    scenes: list[dict[str, Any]],
    *,
    subject_family: str,
    layout_type: str,
    semantic_objects: list[dict[str, str]],
) -> list[dict[str, Any]]:
    object_labels = [
        item["label"] for item in semantic_objects if _clean_text(item.get("label"))
    ]
    enriched: list[dict[str, Any]] = []
    for index, scene in enumerate(scenes):
        current = dict(scene)
        focus_sequence = [
            _clean_text(item)
            for item in current.get("focus_sequence") or []
            if _clean_text(item)
        ]
        if not focus_sequence and object_labels:
            if subject_family == "traversal_path":
                focus_sequence = object_labels[: min(4, len(object_labels))]
            elif subject_family in {
                "pipeline_sequence",
                "lifecycle_cycle",
                "energy_transfer",
            }:
                focus_sequence = object_labels[: min(3, len(object_labels))]
        shot_type = _clean_text(current.get("shot_type")).lower() or "focus"
        if shot_type == "intro":
            scene_actions = ["establish", "reveal_layout", "set_context"]
        elif shot_type == "summary":
            scene_actions = ["recap", "merge", "settle"]
        elif subject_family == "protocol_exchange":
            scene_actions = ["emit", "travel", "confirm"]
        elif subject_family == "traversal_path":
            scene_actions = ["trace_path", "visit", "append_result"]
        elif subject_family == "energy_transfer":
            scene_actions = ["charge", "flow", "convert"]
        elif subject_family == "lifecycle_cycle":
            scene_actions = ["grow", "transform", "advance_stage"]
        else:
            scene_actions = ["highlight", "advance", "handoff"]
        focus_target = (
            focus_sequence[0]
            if focus_sequence
            else (
                object_labels[min(index, len(object_labels) - 1)]
                if object_labels
                else ""
            )
        )
        current["focus_sequence"] = focus_sequence
        current["focus_target"] = focus_target
        current["scene_actions"] = scene_actions
        current["layout_type"] = layout_type
        enriched.append(current)
    return enriched


def _default_scenes(
    *,
    title: str,
    summary: str,
    focus: str,
    visual_type: str,
    duration_seconds: int,
) -> list[dict[str, Any]]:
    focus_points = _split_key_points(focus) or _split_key_points(summary)
    summary_points = _split_key_points(summary)
    complexity_hint = len(focus_points) + len(summary_points)
    requested_scene_count = _extract_scene_count_constraint(title, summary, focus)
    scene_budget = _resolve_scene_budget(
        duration_seconds=duration_seconds,
        visual_type=visual_type,
        complexity=complexity_hint,
    )
    if requested_scene_count:
        scene_budget = max(scene_budget, requested_scene_count)
    if visual_type == "relationship_change":
        scenes = [
            {
                "title": "先看变化对象",
                "description": summary or f"说明 {title} 中哪些量在变化。",
                "emphasis": focus_points[0] if focus_points else "先定义变量和观察维度",
                "transition": "fade",
                "shot_type": "intro",
            },
            {
                "title": "突出关键拐点",
                "description": (
                    focus_points[1]
                    if len(focus_points) > 1
                    else "强调上升、下降或转折出现的位置。"
                ),
                "emphasis": "不要平均展示所有阶段",
                "transition": "slide",
                "shot_type": "focus",
            },
            {
                "title": "给出教学结论",
                "description": (
                    summary_points[0]
                    if summary_points
                    else f"把 {title} 的变化规律落回课堂结论。"
                ),
                "emphasis": (
                    focus_points[-1] if focus_points else "结论要便于教师口头解释"
                ),
                "transition": "zoom",
                "shot_type": "summary",
            },
        ]
        if scene_budget > 3:
            scenes.insert(
                2,
                {
                    "title": "局部趋势细看",
                    "description": "在关键区间放大变化，解释为什么会出现这一段走势。",
                    "emphasis": "聚焦关键段，不平均铺开",
                    "transition": "slide",
                    "shot_type": "focus",
                },
            )
        return scenes[:scene_budget]
    if visual_type == "structure_breakdown":
        structure_parts = _extract_structure_parts(title, summary, focus)
        if structure_parts:
            lead = " -> ".join(structure_parts[:5])
            structure_details = _build_object_details(structure_parts)
            combined_text = " ".join(item for item in (title, summary, focus) if item)
            has_encapsulation = any(
                token in combined_text
                for token in ("封装", "解封装", "封装流程", "数据封装")
            )
            scene_budget = _resolve_scene_budget(
                duration_seconds=duration_seconds,
                visual_type=visual_type,
                complexity=len(structure_parts),
            )
            focus_scene_budget = max(1, scene_budget - 2)
            chunk_size = max(
                1,
                (len(structure_parts) + focus_scene_budget - 1) // focus_scene_budget,
            )
            focus_scenes: list[dict[str, Any]] = []
            for index in range(focus_scene_budget):
                chunk = structure_parts[index * chunk_size : (index + 1) * chunk_size]
                if not chunk:
                    continue
                chunk_details = [
                    detail for detail in structure_details if detail["label"] in chunk
                ]
                if len(chunk) == 1:
                    focus_title = f"聚焦 {chunk[0]}"
                else:
                    focus_title = f"聚焦 {chunk[0]}-{chunk[-1]}"
                focus_scenes.append(
                    {
                        "title": focus_title,
                        "description": (
                            "按顺序突出当前层组职责差异，说明数据如何被处理和传递。"
                        ),
                        "emphasis": "当前层高亮，非当前层弱化",
                        "key_points": [
                            _clip_text(
                                detail["label"] + "：" + detail["role"][:18],
                                maximum=22,
                            )
                            for detail in chunk_details[:3]
                        ],
                        "focus_sequence": chunk,
                        "transition": "slide" if index == 0 else "zoom",
                        "shot_type": "focus",
                    }
                )
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
                    "transition": "fade",
                    "shot_type": "intro",
                },
                *focus_scenes,
                {
                    "title": "回到层间协作",
                    "description": (
                        (
                            f"总结这些层如何共同完成 {title} 的整体工作，强调发送时如何逐层封装、接收时如何逐层还原。"
                            if has_encapsulation
                            else f"总结这些层如何共同完成 {title} 的整体工作，强调每层既独立分工又相互配合。"
                        )
                    ),
                    "emphasis": "把结构意义落回课堂结论",
                    "key_points": [
                        (
                            "发送时自上而下逐层处理"
                            if has_encapsulation
                            else "各层按清晰边界分工协作"
                        ),
                        (
                            "接收时再按层还原信息"
                            if has_encapsulation
                            else "不同层分别解决不同通信问题"
                        ),
                        "分层让网络设计更清晰可维护",
                    ],
                    "focus_sequence": structure_parts,
                    "transition": "zoom",
                    "shot_type": "summary",
                },
            ]
        return [
            {
                "title": "整体结构",
                "description": summary or f"先展示 {title} 的整体结构。",
                "emphasis": focus_points[0] if focus_points else "先让学生建立整体印象",
                "transition": "fade",
                "shot_type": "intro",
            },
            {
                "title": "拆解关键部分",
                "description": (
                    focus_points[1]
                    if len(focus_points) > 1
                    else "依次突出最重要的两个或三个组成部分。"
                ),
                "emphasis": "强调组成关系和作用差异",
                "transition": "slide",
                "shot_type": "focus",
            },
            {
                "title": "回到结构意义",
                "description": (
                    summary_points[0]
                    if summary_points
                    else "说明各部分如何共同支撑整体功能。"
                ),
                "emphasis": (
                    focus_points[-1] if focus_points else "形成便于记忆的结构结论"
                ),
                "transition": "zoom",
                "shot_type": "summary",
            },
        ]
    combined_text = " ".join(item for item in (title, summary, focus) if item)
    upper_text = combined_text.upper()
    is_tcp_handshake = (
        ("TCP" in upper_text)
        and any(
            token in combined_text
            for token in ("三次握手", "握手", "建立连接", "连接建立")
        )
    ) or ("SYN" in upper_text and "ACK" in upper_text)
    is_tcp_teardown = (
        ("TCP" in upper_text)
        and any(
            token in combined_text
            for token in ("四次挥手", "挥手", "断开", "连接终止", "关闭连接")
        )
    ) or any(token in upper_text for token in ("FIN", "TIME_WAIT", "CLOSE_WAIT"))
    if is_tcp_handshake and not is_tcp_teardown:
        handshake_scenes = [
            {
                "title": "第一步：客户端发送 SYN",
                "description": "客户端发起连接请求，进入 SYN-SENT。",
                "emphasis": "主动发起连接",
                "transition": "cut",
                "shot_type": "intro",
                "camera": "wide",
            },
            {
                "title": "第二步：服务端返回 SYN+ACK",
                "description": "服务端确认并同步发送 SYN，进入 SYN-RECEIVED。",
                "emphasis": "确认与同步进行",
                "transition": "soft_wipe",
                "shot_type": "focus",
                "camera": "close",
            },
            {
                "title": "第三步：客户端返回 ACK",
                "description": "客户端确认后双方进入 ESTABLISHED。",
                "emphasis": "三次报文完成建连",
                "transition": "dissolve",
                "shot_type": "summary",
                "camera": "zoom_out",
            },
        ]
        return handshake_scenes
    if is_tcp_teardown:
        teardown_scenes = [
            {
                "title": "第一步：客户端发送 FIN",
                "description": "主动关闭方发送 FIN，进入 FIN-WAIT-1。",
                "emphasis": "请求关闭连接",
                "transition": "fade",
                "shot_type": "intro",
                "camera": "wide",
            },
            {
                "title": "第二步：服务端返回 ACK",
                "description": "被动关闭方确认 FIN，客户端进入 FIN-WAIT-2。",
                "emphasis": "先确认、后关闭",
                "transition": "slide",
                "shot_type": "focus",
                "camera": "close",
            },
            {
                "title": "第三步：服务端发送 FIN",
                "description": "服务端准备完成后发送 FIN，进入 LAST-ACK。",
                "emphasis": "关闭方向反转",
                "transition": "slide",
                "shot_type": "focus",
                "camera": "track_right",
            },
            {
                "title": "第四步：客户端返回 ACK",
                "description": "客户端确认后进入 TIME-WAIT，等待 2MSL 后彻底关闭。",
                "emphasis": "TIME-WAIT 保障可靠终止",
                "transition": "zoom",
                "shot_type": "summary",
                "camera": "zoom_out",
            },
        ]
        return teardown_scenes

    scenes = [
        {
            "title": "引入主题",
            "description": summary or f"说明这段动画为什么要讲 {title}。",
            "emphasis": focus_points[0] if focus_points else "先让学生知道要看什么",
            "transition": "fade",
            "shot_type": "intro",
        },
        {
            "title": "展开关键过程",
            "description": (
                focus_points[1]
                if len(focus_points) > 1
                else "按步骤突出阶段切换、条件变化和因果关系。"
            ),
            "emphasis": "关键步骤要明显，避免平均分配篇幅",
            "transition": "slide",
            "shot_type": "focus",
        },
        {
            "title": "收束到结论",
            "description": (
                summary_points[0]
                if summary_points
                else f"总结 {title} 的关键机制和课堂落点。"
            ),
            "emphasis": focus_points[-1] if focus_points else "结论要便于教师插入讲解",
            "transition": "zoom",
            "shot_type": "summary",
        },
    ]
    if scene_budget > 3:
        scenes.insert(
            2,
            {
                "title": "中段强化",
                "description": "单独放大一个关键环节，减少无关信息干扰。",
                "emphasis": "突出关键因果或变化节点",
                "transition": "slide",
                "shot_type": "focus",
            },
        )
    if scene_budget > len(scenes):
        extra_count = scene_budget - len(scenes)
        for index in range(extra_count):
            scenes.insert(
                min(len(scenes), 2 + index),
                {
                    "title": f"补充讲解 {index + 1}",
                    "description": (
                        focus_points[index % len(focus_points)]
                        if focus_points
                        else (
                            summary_points[index % len(summary_points)]
                            if summary_points
                            else "补充展开关键步骤与状态变化。"
                        )
                    ),
                    "emphasis": "按用户要求细化段落，不压缩步骤",
                    "transition": "slide",
                    "shot_type": "focus",
                },
            )
    return scenes[:scene_budget]


def _normalize_scene(
    raw_scene: Any,
    *,
    index: int,
    title: str,
    focus: str,
    visual_type: str,
) -> dict[str, Any]:
    if not isinstance(raw_scene, dict):
        shot_type = "intro" if index == 1 else "focus"
        return {
            "id": f"scene-{index}",
            "title": f"镜头 {index}",
            "description": _clean_text(raw_scene) or f"{title} 的第 {index} 个镜头",
            "emphasis": _clean_text(focus),
            "key_points": [],
            "shot_type": shot_type,
            "transition": _normalize_transition(None, index=index),
            "camera": _resolve_scene_camera(
                None,
                shot_type=shot_type,
                index=index,
            ),
        }

    scene_title = (
        _sanitize_display_copy(_clean_text(raw_scene.get("title"))) or f"镜头 {index}"
    )
    shot_type = _clean_text(raw_scene.get("shot_type")).lower()
    if shot_type not in _SHOT_TYPES:
        if "总结" in scene_title or "协作" in scene_title:
            shot_type = "summary"
        elif "引入" in scene_title or "整体" in scene_title or "先看" in scene_title:
            shot_type = "intro"
        else:
            shot_type = "focus"
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

    clipped_description = _clip_text(_sanitize_display_copy(description), maximum=72)
    clipped_emphasis = _clip_text(_sanitize_display_copy(emphasis), maximum=26)
    clipped_key_points: list[str] = []
    for item in key_points:
        clipped = _clip_text(item, maximum=22)
        if (
            clipped
            and clipped != clipped_description
            and clipped not in clipped_key_points
        ):
            clipped_key_points.append(clipped)

    return {
        "id": _clean_text(raw_scene.get("id")) or f"scene-{index}",
        "title": _clip_text(scene_title, maximum=14) or f"镜头 {index}",
        "shot_type": shot_type,
        "description": clipped_description,
        "emphasis": clipped_emphasis,
        "key_points": clipped_key_points[:3],
        "transition": _normalize_transition(raw_scene.get("transition"), index=index),
        "camera": _resolve_scene_camera(
            raw_scene.get("camera"),
            shot_type=shot_type,
            index=index,
        ),
        "focus_sequence": [
            _clean_text(item)
            for item in (raw_scene.get("focus_sequence") or [])
            if _clean_text(item)
        ],
    }


def _enforce_scene_progression(scenes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not scenes:
        return scenes
    if len(scenes) == 1:
        only = dict(scenes[0])
        only["shot_type"] = "focus"
        only["camera"] = _resolve_scene_camera(None, shot_type="focus", index=1)
        return [only]

    normalized: list[dict[str, Any]] = []
    for index, scene in enumerate(scenes, start=1):
        current = dict(scene)
        original_shot = _clean_text(current.get("shot_type")).lower()
        if index == 1:
            current["shot_type"] = "intro"
        elif index == len(scenes):
            current["shot_type"] = "summary"
        else:
            current["shot_type"] = "focus"
        if current.get("shot_type") != original_shot or not _clean_text(
            current.get("camera")
        ):
            current["camera"] = _resolve_scene_camera(
                None,
                shot_type=str(current["shot_type"]),
                index=index,
            )
        normalized.append(current)
    return normalized


def normalize_animation_spec(content: dict[str, Any]) -> dict[str, Any]:
    title = _sanitize_display_copy(_clean_text(content.get("title"))) or "教学动画"
    topic = _sanitize_display_copy(_clean_text(content.get("topic"))) or title
    summary = _sanitize_display_copy(
        _clean_text(content.get("summary")) or _clean_text(content.get("scene"))
    )
    focus = _sanitize_display_copy(
        _clean_text(content.get("focus")) or _clean_text(content.get("motion_brief"))
    )
    duration_seconds = _clamp_int(
        content.get("duration_seconds"), default=6, minimum=3, maximum=20
    )
    rhythm = _clean_text(content.get("rhythm")).lower() or "balanced"
    if rhythm not in {"slow", "balanced", "fast"}:
        rhythm = "balanced"

    visual_type = infer_visual_type(content)
    subject_family = infer_subject_family(content, visual_type)
    layout_type = infer_layout_type(subject_family, visual_type)
    style_pack = _resolve_style_pack(content.get("style_pack"))
    raw_scenes = content.get("scenes")
    normalized_scenes = [
        _normalize_scene(
            scene,
            index=index,
            title=title,
            focus=focus,
            visual_type=visual_type,
        )
        for index, scene in enumerate(raw_scenes or [], start=1)
    ]
    if not normalized_scenes:
        normalized_scenes = [
            _normalize_scene(
                scene,
                index=index,
                title=title,
                focus=focus,
                visual_type=visual_type,
            )
            for index, scene in enumerate(
                _default_scenes(
                    title=title,
                    summary=summary,
                    focus=focus,
                    visual_type=visual_type,
                    duration_seconds=duration_seconds,
                ),
                start=1,
            )
        ]
    normalized_scenes = _enforce_scene_progression(normalized_scenes)
    semantic_objects = _build_semantic_objects(
        title=title,
        summary=summary,
        focus=focus,
        subject_family=subject_family,
        visual_type=visual_type,
        scenes=normalized_scenes,
    )
    normalized_scenes = _enrich_scene_semantics(
        normalized_scenes,
        subject_family=subject_family,
        layout_type=layout_type,
        semantic_objects=semantic_objects,
    )

    teaching_goal = (
        _sanitize_display_copy(_clean_text(content.get("teaching_goal")))
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
        "subject_family": subject_family,
        "layout_type": layout_type,
        "style_pack": style_pack,
        "duration_seconds": duration_seconds,
        "rhythm": rhythm,
        "theme": _resolve_theme(style_pack, content.get("theme")),
        "scenes": normalized_scenes,
        "objects": [item["label"] for item in semantic_objects],
        "object_details": semantic_objects,
    }
    return spec
