"""Animation fallback storyboard content."""

from __future__ import annotations

from typing import Any


def fallback_animation_content(
    config: dict[str, Any], rag_snippets: list[str]
) -> dict[str, Any]:
    topic = str(config.get("topic") or "演示主题")
    render_mode = str(config.get("render_mode") or "gif").strip().lower()
    duration_seconds = int(config.get("duration_seconds") or 6)
    rhythm = str(config.get("rhythm") or "balanced")
    focus = str(config.get("focus") or topic)
    description = (
        rag_snippets[0][:140] if rag_snippets else f"围绕{topic}展示关键过程。"
    )
    visual_type = (
        "relationship_change" if "变化" in topic or "关系" in topic else "process_flow"
    )
    return {
        "kind": "animation_storyboard",
        "title": f"{topic}演示动画",
        "summary": description,
        "format": "mp4" if render_mode == "cloud_video_wan" else "gif",
        "topic": topic,
        "duration_seconds": duration_seconds,
        "rhythm": rhythm,
        "focus": focus,
        "visual_type": visual_type,
        "render_mode": render_mode,
        "cloud_video_provider": (
            "aliyun_wan" if render_mode == "cloud_video_wan" else None
        ),
        "placements": [],
        "scenes": [
            {
                "title": "引入主题",
                "description": f"先说明 {topic} 要看什么。",
                "emphasis": "建立观察对象",
            },
            {
                "title": "关键变化",
                "description": description,
                "emphasis": focus,
            },
            {
                "title": "收束结论",
                "description": f"总结 {topic} 的课堂讲解落点。",
                "emphasis": "形成可直接讲授的结论",
            },
        ],
    }
