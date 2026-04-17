"""Speaker notes structured refine."""

from __future__ import annotations

import copy
import re
from typing import Any

from .common import _load_rag_snippets


def _resolve_slide_page(config: dict[str, Any], slides: list[dict[str, Any]]) -> int:
    segment = str(config.get("selected_script_segment") or "").strip()
    match = re.search(r"slide-(\d+)", segment)
    if match:
        return max(1, int(match.group(1)))
    active_page = config.get("active_page")
    if isinstance(active_page, int) and active_page > 0:
        return active_page
    if slides:
        first_page = slides[0].get("page")
        if isinstance(first_page, int) and first_page > 0:
            return first_page
    return 1


async def refine_speaker_notes_content(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
    project_id: str,
    rag_source_ids: list[str] | None,
) -> dict[str, Any]:
    updated = copy.deepcopy(current_content)
    slides = [
        dict(slide)
        for slide in (updated.get("slides") or [])
        if isinstance(slide, dict)
    ]
    if not slides:
        slides = [
            {
                "page": 1,
                "title": "说课页 1",
                "script": "",
                "action_hint": "",
                "transition_line": "",
            }
        ]
    page = _resolve_slide_page(config, slides)
    rag_snippets = await _load_rag_snippets(
        project_id=project_id,
        query=str(
            message or updated.get("topic") or updated.get("title") or "讲稿改写"
        ),
        rag_source_ids=rag_source_ids,
    )
    is_transition = "transition" in str(config.get("selected_script_segment") or "")
    for slide in slides:
        if int(slide.get("page") or 0) != page:
            continue
        if is_transition:
            slide["transition_line"] = str(message or "已重写过渡语").strip()
        else:
            slide["script"] = str(message or "已重写讲稿正文").strip()
        if rag_snippets:
            slide["action_hint"] = rag_snippets[0]
        break
    updated["kind"] = "speaker_notes"
    updated["slides"] = slides
    updated["summary"] = f"已更新第 {page} 页讲稿内容。"
    return updated
