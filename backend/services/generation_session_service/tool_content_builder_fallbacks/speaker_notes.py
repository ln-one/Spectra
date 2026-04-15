"""Speaker notes fallback content."""

from __future__ import annotations

from typing import Any


def fallback_speaker_notes_content(
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
    source_artifact_id: str | None,
) -> dict[str, Any]:
    topic = str(config.get("topic") or "课堂说课讲稿")
    tone = str(config.get("tone") or "professional")
    emphasize_interaction = bool(config.get("emphasize_interaction", True))
    normalized_source_artifact_id = str(
        source_artifact_id or config.get("source_artifact_id") or ""
    ).strip()
    slides = []
    base_titles = ["教学目标", "核心知识", "重点难点", "课堂互动"]
    hints = rag_snippets[:4] or [
        f"围绕{topic}说明课程定位。",
        f"说明{topic}的关键知识结构。",
        "解释本课的重点与难点设计。",
        "补充课堂互动与收束策略。",
    ]
    for index, hint in enumerate(hints, start=1):
        slides.append(
            {
                "page": index,
                "title": base_titles[(index - 1) % len(base_titles)],
                "script": (
                    f"第{index}页我会用{tone}语气展开讲解，"
                    f"先说明{topic}的教学意图，再承接到“{hint[:70]}”。"
                ),
                "action_hint": (
                    "建议停顿并与学生互动。"
                    if emphasize_interaction
                    else "保持平稳讲述节奏。"
                ),
                "transition_line": f"接下来过渡到第{index + 1}页的教学展开。",
            }
        )
    return {
        "kind": "speaker_notes",
        "title": f"{topic}说课讲稿",
        "summary": (
            f"基于 {source_hint or '当前课件'} 生成 {len(slides)} 页逐页讲稿，"
            f"语气为 {tone}。"
        ),
        "topic": topic,
        "tone": tone,
        "source_artifact_id": normalized_source_artifact_id or None,
        "slides": slides,
    }
