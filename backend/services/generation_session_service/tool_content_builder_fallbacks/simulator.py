"""Classroom simulator fallback content."""

from __future__ import annotations

from typing import Any


def fallback_simulator_content(
    config: dict[str, Any], rag_snippets: list[str]
) -> dict[str, Any]:
    topic = str(config.get("topic") or config.get("question_focus") or "课堂重点")
    profile = str(config.get("profile") or "detail_oriented")
    intensity = int(config.get("intensity") or 60)
    turns = []
    hints = rag_snippets[:3] or [
        f"请解释{topic}的关键前提。",
        f"如果学生继续追问，补充{topic}的反例。",
        "最后给出板书或课堂活动建议。",
    ]
    for index, hint in enumerate(hints, start=1):
        turns.append(
            {
                "student": f"{profile}_student_{index}",
                "question": f"第{index}轮追问：{hint[:80]}",
                "teacher_hint": (
                    "建议教师先用一句话回应，再补一个例子。" f" 强度档位 {intensity}。"
                ),
                "feedback": "观察是否回答到概念边界、步骤依据和易错点。",
            }
        )
    return {
        "kind": "classroom_qa_simulator",
        "title": f"{topic}学情预演",
        "summary": (
            f"围绕“{topic}”生成 {len(turns)} 轮课堂问答预演，" f"学生画像为 {profile}。"
        ),
        "key_points": [
            "先回应学生真实困惑，再给结构化解释。",
            "保留一个追问节点，检查教师是否讲到边界条件。",
            "最后补课堂策略，帮助落回教学目标。",
        ],
        "turns": turns,
        "question_focus": topic,
        "student_profiles": [profile],
    }


def next_turn_anchor(turns: list[dict]) -> str:
    return f"turn-{len(turns) + 1}"


def fallback_simulator_turn_result(
    *,
    current_content: dict[str, Any],
    teacher_answer: str,
    config: dict[str, Any],
    turn_anchor: str | None,
    rag_snippets: list[str],
) -> tuple[dict[str, Any], dict[str, Any]]:
    turns = [
        dict(turn)
        for turn in (current_content.get("turns") or [])
        if isinstance(turn, dict)
    ]
    target_anchor = str(turn_anchor or "").strip()
    next_anchor = target_anchor or next_turn_anchor(turns)
    topic = str(
        config.get("topic")
        or current_content.get("question_focus")
        or current_content.get("title")
        or "课堂重点"
    )
    profile = str(
        config.get("profile")
        or (current_content.get("student_profiles") or ["detail_oriented"])[0]
    )
    hint = (
        rag_snippets[0][:80]
        if rag_snippets
        else f"{topic}里最容易被继续追问的边界条件是什么？"
    )
    question = f"如果进一步追问，{hint}"
    feedback = (
        "回答已经覆盖核心概念，下一步建议补充步骤依据和易错点。"
        if teacher_answer.strip()
        else "需要先给出明确回答，再补例子。"
    )
    score = 82 if teacher_answer.strip() else 55
    turn_record = {
        "turn_anchor": next_anchor,
        "student": profile,
        "question": question,
        "teacher_answer": teacher_answer,
        "teacher_hint": "先给一句结论，再补反例或步骤说明。",
        "feedback": feedback,
        "score": score,
    }
    if target_anchor:
        replaced = False
        for index, turn in enumerate(turns):
            if str(turn.get("turn_anchor") or "") == target_anchor:
                turns[index] = turn_record
                replaced = True
                break
        if not replaced:
            turns.append(turn_record)
    else:
        turns.append(turn_record)

    updated_content = dict(current_content)
    updated_content["kind"] = "classroom_qa_simulator"
    updated_content["turns"] = turns
    updated_content["summary"] = (
        f"围绕“{topic}”已累计完成 {len(turns)} 轮课堂问答预演。"
    )
    updated_content["question_focus"] = topic
    updated_content["student_profiles"] = [profile]
    turn_result = {
        "turn_anchor": next_anchor,
        "student_profile": profile,
        "student_question": question,
        "teacher_answer": teacher_answer,
        "feedback": feedback,
        "score": score,
        "next_focus": "受力分解与参考系",
    }
    return updated_content, turn_result
