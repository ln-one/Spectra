"""Animation visual-type and subject semantics."""

from __future__ import annotations

import re
from typing import Any

from .constants import (
    _NETWORK_LAYER_DETAILS,
    _NETWORK_LAYER_ORDER,
    _OSI_LAYER_ORDER,
    _SUBJECT_FAMILIES,
    _VISUAL_TYPES,
)
from .text import _clean_text


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
