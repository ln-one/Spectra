"""Courseware and quiz fallback content."""

from __future__ import annotations

from typing import Any


def fallback_quiz_content(
    config: dict[str, Any], rag_snippets: list[str]
) -> dict[str, Any]:
    scope = str(config.get("scope") or config.get("question_focus") or "核心知识点")
    difficulty = str(config.get("difficulty") or "medium")
    question_type = str(config.get("question_type") or "single")
    count = int(config.get("count") or config.get("question_count") or 5)
    style_tags = list(config.get("style_tags") or [])
    questions = []
    for index in range(max(1, min(count, 10))):
        snippet = rag_snippets[index % len(rag_snippets)] if rag_snippets else ""
        options = [
            f"{scope}的基础理解",
            f"{scope}的常见误区",
            f"{scope}的迁移应用",
            f"{scope}的反例辨析",
        ]
        questions.append(
            {
                "id": f"quiz-{index + 1}",
                "question": (
                    f"第{index + 1}题：围绕“{scope}”设计一题"
                    f"{difficulty}难度的{question_type}题。"
                ),
                "options": options,
                "answer": options[0],
                "explanation": (
                    f"解析聚焦“{scope}”的教学重点。"
                    + (f" 参考资料提示：{snippet[:120]}" if snippet else "")
                    + (
                        f" 风格要求：{'、'.join(str(tag) for tag in style_tags[:3])}"
                        if style_tags
                        else ""
                    )
                ).strip(),
            }
        )
    return {
        "kind": "quiz",
        "title": f"{scope}随堂小测",
        "scope": scope,
        "difficulty": difficulty,
        "question_count": len(questions),
        "question_type": question_type,
        "questions": questions,
    }


def fallback_courseware_ppt_content(
    config: dict[str, Any], rag_snippets: list[str]
) -> dict[str, Any]:
    topic = str(config.get("topic") or "教学主题")
    pages = max(6, min(int(config.get("pages") or 12), 40))
    audience = str(config.get("audience") or "intermediate")
    template = str(config.get("template") or "default")
    snippet = rag_snippets[0][:120] if rag_snippets else ""
    return {
        "kind": "courseware_ppt",
        "title": f"{topic}课件",
        "summary": (
            f"面向 {audience} 层级生成 {pages} 页课件，模板 {template}。"
            + (f" 参考资料：{snippet}" if snippet else "")
        ).strip(),
        "pages": pages,
        "audience": audience,
        "template": template,
    }
