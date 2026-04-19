"""Speaker notes structured refine."""

from __future__ import annotations

import copy
from typing import Any

from .common import _load_rag_snippets


def _resolve_selection_anchor(
    config: dict[str, Any],
    current_content: dict[str, Any],
) -> dict[str, Any] | None:
    anchors = current_content.get("anchors")
    if not isinstance(anchors, list):
        return None
    requested_anchor_id = ""
    raw_selection_anchor = config.get("selection_anchor")
    if isinstance(raw_selection_anchor, dict):
        requested_anchor_id = str(raw_selection_anchor.get("anchor_id") or "").strip()
    if requested_anchor_id:
        for anchor in anchors:
            if (
                isinstance(anchor, dict)
                and str(anchor.get("anchor_id") or "").strip() == requested_anchor_id
            ):
                merged = dict(anchor)
                if isinstance(raw_selection_anchor, dict):
                    merged.update(raw_selection_anchor)
                return merged
    active_page = config.get("active_page")
    if isinstance(active_page, int):
        for anchor in anchors:
            if (
                isinstance(anchor, dict)
                and anchor.get("scope") == "page"
                and anchor.get("label") == f"第 {active_page} 页"
            ):
                return dict(anchor)
    return None


def _append_context_suffix(text: str, rag_snippets: list[str]) -> str:
    if not rag_snippets:
        return text
    suffix = rag_snippets[0].strip()
    if not suffix:
        return text
    return f"{text}\n\n讲解提示：{suffix}"


async def refine_speaker_notes_content(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
    project_id: str,
    rag_source_ids: list[str] | None,
) -> dict[str, Any]:
    updated = copy.deepcopy(current_content)
    slides = updated.get("slides")
    if not isinstance(slides, list) or not slides:
        return updated

    anchor = _resolve_selection_anchor(config, updated)
    rag_snippets = await _load_rag_snippets(
        project_id=project_id,
        query=str(message or updated.get("title") or "说课讲稿改写"),
        rag_source_ids=rag_source_ids,
    )
    refined_text = _append_context_suffix(str(message or "").strip(), rag_snippets).strip()
    if not refined_text:
        refined_text = "已根据当前上下文完成改写。"

    target_anchor_id = str((anchor or {}).get("anchor_id") or "").strip()
    target_scope = str((anchor or {}).get("scope") or "paragraph").strip() or "paragraph"
    updated_any = False

    for slide in slides:
        if not isinstance(slide, dict):
            continue
        if target_scope == "page":
            slide_anchor = f"speaker_notes:v2:{slide.get('id')}:page"
            if target_anchor_id and target_anchor_id != slide_anchor:
                continue
            sections = slide.get("sections")
            if not isinstance(sections, list) or not sections:
                continue
            first_section = sections[0] if isinstance(sections[0], dict) else None
            if not first_section:
                continue
            paragraphs = first_section.get("paragraphs")
            if not isinstance(paragraphs, list) or not paragraphs:
                continue
            first_paragraph = paragraphs[0] if isinstance(paragraphs[0], dict) else None
            if not first_paragraph:
                continue
            first_paragraph["text"] = refined_text
            updated_any = True
            break

        sections = slide.get("sections")
        if not isinstance(sections, list):
            continue
        for section in sections:
            if not isinstance(section, dict):
                continue
            paragraphs = section.get("paragraphs")
            if not isinstance(paragraphs, list):
                continue
            for paragraph in paragraphs:
                if not isinstance(paragraph, dict):
                    continue
                paragraph_anchor_id = str(paragraph.get("anchor_id") or "").strip()
                if target_anchor_id and paragraph_anchor_id != target_anchor_id:
                    continue
                paragraph["text"] = refined_text
                updated_any = True
                break
            if updated_any:
                break
        if updated_any:
            break

    if updated_any:
        target_label = str((anchor or {}).get("label") or "当前选中讲稿片段").strip()
        updated["summary"] = f"已更新{target_label}。"
    return updated
