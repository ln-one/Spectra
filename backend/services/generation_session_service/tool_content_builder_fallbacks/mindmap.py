"""Mindmap fallback content."""

from __future__ import annotations

from typing import Any


def fallback_mindmap_content(
    config: dict[str, Any], rag_snippets: list[str]
) -> dict[str, Any]:
    topic = str(config.get("topic") or "课程主题")
    focus = str(config.get("focus") or config.get("focus_scope") or "concept")
    depth = max(2, min(int(config.get("depth") or 3), 4))
    nodes = [
        {
            "id": "root",
            "parent_id": None,
            "title": topic,
            "summary": f"聚焦{focus}视角组织知识结构。",
        }
    ]
    branch_titles = ["核心概念", "关键过程", "典型误区", "课堂应用"]
    for index in range(depth):
        branch_id = f"node-{index + 1}"
        summary = (
            rag_snippets[index][:140]
            if index < len(rag_snippets)
            else f"{topic}的第{index + 1}个重点分支。"
        )
        nodes.append(
            {
                "id": branch_id,
                "parent_id": "root",
                "title": branch_titles[index % len(branch_titles)],
                "summary": summary,
            }
        )
        nodes.append(
            {
                "id": f"{branch_id}-detail",
                "parent_id": branch_id,
                "title": f"{branch_titles[index % len(branch_titles)]}展开",
                "summary": (
                    f"面向{config.get('target_audience') or '当前班级'}"
                    "补充可讲解细节。"
                ),
            }
        )
    return {
        "title": f"{topic}思维导图",
        "kind": "mindmap",
        "topic": topic,
        "focus": focus,
        "depth": depth,
        "nodes": nodes,
    }
