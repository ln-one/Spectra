"""Bounded fallback data for interactive game templates."""

from __future__ import annotations

from typing import Any

from .schema import is_template_game_pattern, resolve_game_pattern, validate_game_data


def build_game_fallback_data(
    *,
    pattern: str,
    config: dict[str, Any],
    rag_snippets: list[str],
) -> dict[str, Any]:
    if not is_template_game_pattern(pattern):
        raise ValueError(f"unsupported_game_pattern:{pattern}")

    topic = str(config.get("topic") or "课堂主题").strip() or "课堂主题"
    source = rag_snippets[0][:120] if rag_snippets else ""
    base_instruction = (
        str(config.get("creative_brief") or "").strip()
        or f"围绕“{topic}”完成课堂互动，优先关注概念理解与应用。"
    )

    if pattern == "timeline_sort":
        events = [
            {
                "id": "evt-1",
                "label": f"{topic}导入",
                "year": "第1阶段",
                "hint": "先理解背景",
            },
            {
                "id": "evt-2",
                "label": f"{topic}核心机制",
                "year": "第2阶段",
                "hint": "提炼关键概念",
            },
            {
                "id": "evt-3",
                "label": f"{topic}应用练习",
                "year": "第3阶段",
                "hint": "结合案例",
            },
        ]
        if source:
            events[1]["hint"] = source
        payload = {
            "game_title": f"{topic}时间轴排序",
            "instruction": base_instruction,
            "events": events,
            "correct_order": [item["id"] for item in events],
            "success_message": "排序正确，时间线完整。",
            "retry_message": "顺序不对，回顾阶段关系后再试一次。",
        }
        validate_game_data(pattern, payload)
        return payload

    if pattern in {"concept_match", "term_pairing"}:
        pairs = [
            {
                "id": "pair-1",
                "concept": f"{topic}概念A",
                "definition": "用于描述基础定义与边界。",
            },
            {
                "id": "pair-2",
                "concept": f"{topic}概念B",
                "definition": "用于解释关键运行机制。",
            },
            {
                "id": "pair-3",
                "concept": f"{topic}概念C",
                "definition": "用于连接实际应用场景。",
            },
        ]
        if source:
            pairs[2]["definition"] = source
        payload = {
            "game_title": f"{topic}{'术语配对' if pattern == 'term_pairing' else '概念连线'}",
            "instruction": base_instruction,
            "pairs": pairs,
            "success_message": (
                "全部配对正确，术语和含义已经建立清晰对应。"
                if pattern == "term_pairing"
                else "连线全部正确，概念关联清晰。"
            ),
            "retry_message": (
                "还有术语没有配对成功，先回看定义再试一次。"
                if pattern == "term_pairing"
                else "仍有连线错误，请先复习概念定义。"
            ),
        }
        validate_game_data(pattern, payload)
        return payload

    if pattern in {"quiz_challenge", "quiz_run"}:
        levels = [
            {
                "id": "level-1",
                "question": f"{topic}中最基础的概念是？",
                "options": ["核心定义", "无关术语", "随机记忆", "纯经验描述"],
                "correct_index": 0,
                "explanation": "先掌握核心定义，后续机制理解才稳定。",
            },
            {
                "id": "level-2",
                "question": f"{topic}的关键机制最接近下列哪一项？",
                "options": ["结构化流程", "完全随机", "不可解释过程", "纯背诵"],
                "correct_index": 0,
                "explanation": source or "关键机制应体现可解释、可验证的流程。",
            },
        ]
        payload = {
            "game_title": f"{topic}{'极速问答跑酷' if pattern == 'quiz_run' else '知识闯关'}",
            "instruction": base_instruction,
            "total_lives": max(1, min(int(config.get("life") or 3), 5)),
            "levels": levels,
            "victory_message": (
                "连续答对全部关卡，顺利完成这一轮课堂冲刺。"
                if pattern == "quiz_run"
                else "恭喜通关，已完成全部关卡。"
            ),
            "game_over_message": (
                "本轮冲刺已结束，请根据解析调整后重新出发。"
                if pattern == "quiz_run"
                else "生命值耗尽，请回看解析后重试。"
            ),
        }
        validate_game_data(pattern, payload)
        return payload

    paragraphs = [
        {
            "id": "para-1",
            "segments": [
                {"type": "text", "content": f"在{topic}学习中，核心目标是理解"},
                {
                    "type": "blank",
                    "blank_id": "b1",
                    "answer": "关键概念",
                    "hint": "四个字",
                },
                {"type": "text", "content": "并将其迁移到真实问题求解中。"},
            ],
        },
        {
            "id": "para-2",
            "segments": [
                {"type": "text", "content": "课堂练习应覆盖"},
                {
                    "type": "blank",
                    "blank_id": "b2",
                    "answer": "机制分析",
                    "hint": "四个字",
                },
                {"type": "text", "content": "和结果验证两个层次。"},
            ],
        },
    ]
    if source:
        paragraphs[1]["segments"][-1]["content"] = f"并结合资料提示：{source}"

    payload = {
        "game_title": f"{topic}填空挑战",
        "instruction": base_instruction,
        "paragraphs": paragraphs,
        "success_message": "填空正确，理解到位。",
        "retry_message": "仍有空白未填对，请根据提示修正。",
    }
    validate_game_data(pattern, payload)
    return payload
