"""Quiz structured refine."""

from __future__ import annotations

import copy
from typing import Any

from .common import _load_rag_snippets


async def refine_quiz_content(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
    project_id: str,
    rag_source_ids: list[str] | None,
) -> dict[str, Any]:
    updated = copy.deepcopy(current_content)
    questions = [
        dict(question)
        for question in (updated.get("questions") or [])
        if isinstance(question, dict)
    ]
    if not questions:
        questions = [
            {
                "id": "quiz-1",
                "question": "",
                "options": [],
                "answer": "",
                "explanation": "",
            }
        ]
    target_id = str(
        config.get("current_question_id")
        or config.get("question_id")
        or questions[0].get("id")
        or "quiz-1"
    )
    rag_snippets = await _load_rag_snippets(
        project_id=project_id,
        query=str(
            message or updated.get("scope") or updated.get("title") or "题目改写"
        ),
        rag_source_ids=rag_source_ids,
    )
    replacement = {
        "id": target_id,
        "question": str(
            message or f"请围绕 {updated.get('scope') or '当前知识点'} 重新出题"
        ).strip(),
        "options": [
            "概念定义",
            "典型误区",
            "迁移应用",
            "边界条件",
        ],
        "answer": "概念定义",
        "explanation": (
            rag_snippets[0] if rag_snippets else "已根据 refine 指令重写题目与解析。"
        ),
    }
    replaced = False
    for index, question in enumerate(questions):
        if str(question.get("id") or "") == target_id:
            questions[index] = replacement
            replaced = True
            break
    if not replaced:
        questions.append(replacement)
    updated["kind"] = "quiz"
    updated["questions"] = questions
    updated["question_count"] = len(questions)
    return updated
