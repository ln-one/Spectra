"""Default scene synthesis for animation specs."""

from __future__ import annotations

from typing import Any

from .semantics import (
    _build_object_details,
    _extract_structure_parts,
)
from .text import (
    _clip_text,
    _extract_scene_count_constraint,
    _resolve_scene_budget,
    _split_key_points,
)


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
