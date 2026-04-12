from __future__ import annotations

import asyncio
import copy
import re
from typing import Any

from services.ai import ai_service


def _split_anchor(anchor: str | None) -> list[str]:
    raw = str(anchor or "").strip()
    if not raw:
        return []
    return [segment for segment in re.split(r"[/>|,]", raw) if segment]


def _resolve_mindmap_target_id(
    current_content: dict[str, Any], config: dict[str, Any]
) -> str:
    raw_anchor = config.get("selected_node_path") or config.get("selected_id")
    for candidate in reversed(_split_anchor(str(raw_anchor or ""))):
        if candidate:
            return candidate
    nodes = current_content.get("nodes") or []
    for node in nodes:
        if isinstance(node, dict) and str(node.get("parent_id") or "") in {"", "None"}:
            return str(node.get("id") or "root")
    return "root"


async def _load_rag_snippets(
    *,
    project_id: str,
    query: str,
    rag_source_ids: list[str] | None,
) -> list[str]:
    timeout_seconds = 5.0
    filters = {"file_ids": rag_source_ids} if rag_source_ids else None
    try:
        coroutine = ai_service._retrieve_rag_context(
            project_id=project_id,
            query=query,
            top_k=3,
            score_threshold=0.3,
            session_id=None,
            filters=filters,
        )
        results = await asyncio.wait_for(coroutine, timeout=timeout_seconds)
    except Exception:
        return []
    snippets: list[str] = []
    for item in results or []:
        if isinstance(item, dict):
            content = str(item.get("content") or "").strip()
            if content:
                snippets.append(content[:220])
    return snippets[:2]


async def refine_mindmap_content(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
    project_id: str,
    rag_source_ids: list[str] | None,
) -> dict[str, Any]:
    updated = copy.deepcopy(current_content)
    nodes = [
        dict(node) for node in (updated.get("nodes") or []) if isinstance(node, dict)
    ]
    target_id = _resolve_mindmap_target_id(current_content, config)
    query = str(config.get("topic") or updated.get("title") or message or "导图扩展")
    rag_snippets = await _load_rag_snippets(
        project_id=project_id,
        query=query,
        rag_source_ids=rag_source_ids,
    )
    next_index = len(nodes) + 1
    branch_title = str(message or "新增分支").strip()[:40] or f"扩展分支 {next_index}"
    summary = rag_snippets[0] if rag_snippets else f"围绕“{branch_title}”扩展知识要点。"
    nodes.append(
        {
            "id": f"{target_id}-refine-{next_index}",
            "parent_id": target_id,
            "title": branch_title,
            "summary": summary,
        }
    )
    updated["kind"] = "mindmap"
    updated["nodes"] = nodes
    updated["summary"] = f"已围绕节点 {target_id} 扩展新的知识分支。"
    return updated


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


def _inject_html_section(html: str, section_html: str) -> str:
    if "</main>" in html:
        return html.replace("</main>", f"{section_html}</main>", 1)
    if "</body>" in html:
        return html.replace("</body>", f"{section_html}</body>", 1)
    return f"{html}{section_html}"


async def refine_game_content(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
    project_id: str,
    rag_source_ids: list[str] | None,
) -> dict[str, Any]:
    updated = copy.deepcopy(current_content)
    current_html = str(updated.get("html") or "<html><body><main></main></body></html>")
    rag_snippets = await _load_rag_snippets(
        project_id=project_id,
        query=str(message or updated.get("title") or "游戏热更新"),
        rag_source_ids=rag_source_ids,
    )
    patch = config.get("sandbox_patch")
    patch_text = ""
    if isinstance(patch, dict):
        parts: list[str] = []
        for key, value in patch.items():
            if isinstance(value, list):
                parts.append(f"{key}: {' / '.join(str(item) for item in value)}")
            else:
                parts.append(f"{key}: {value}")
        patch_text = "；".join(parts)
    note = str(message or patch_text or "已应用游戏规则热更新").strip()
    reference = rag_snippets[0] if rag_snippets else "保持可运行 HTML 结构。"
    section_html = (
        '<section data-refine="sandbox-patch">'
        "<h2>最新热更新</h2>"
        f"<p>{note}</p>"
        f"<p>{reference}</p>"
        "</section>"
    )
    updated["kind"] = "interactive_game"
    updated["html"] = _inject_html_section(current_html, section_html)
    updated["summary"] = note
    return updated


async def refine_animation_content(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
    project_id: str,
    rag_source_ids: list[str] | None,
) -> dict[str, Any]:
    from services.artifact_generator.animation_spec_llm import (
        generate_animation_spec_with_llm,
        merge_llm_spec_into_content,
    )
    from services.artifact_generator.animation_spec import normalize_animation_spec

    updated = copy.deepcopy(current_content)

    # Resolve metadata fields (duration, rhythm, render_mode …) from config first
    render_mode = str(
        config.get("render_mode") or current_content.get("render_mode") or "gif"
    ).strip()
    updated["render_mode"] = render_mode
    updated["format"] = "mp4" if render_mode == "cloud_video_wan" else "gif"
    if render_mode == "cloud_video_wan":
        updated["cloud_video_provider"] = "aliyun_wan"
    else:
        updated.pop("cloud_video_provider", None)

    updated["duration_seconds"] = int(
        config.get("duration_seconds") or current_content.get("duration_seconds") or 6
    )
    updated["rhythm"] = str(
        config.get("rhythm") or current_content.get("rhythm") or "balanced"
    ).strip()

    visual_type = str(
        config.get("visual_type") or current_content.get("visual_type") or ""
    ).strip()
    if visual_type in {"process_flow", "relationship_change", "structure_breakdown"}:
        updated["visual_type"] = visual_type

    style_pack = str(
        config.get("style_pack") or current_content.get("style_pack") or ""
    ).strip()
    if style_pack in {
        "teaching_ppt_cartoon",
        "teaching_ppt_fresh_green",
        "teaching_ppt_deep_blue",
        "teaching_ppt_warm_orange",
        "teaching_ppt_minimal_gray",
    }:
        updated["style_pack"] = style_pack

    new_focus = str(
        config.get("focus") or current_content.get("focus") or message or ""
    ).strip()
    if new_focus:
        updated["focus"] = new_focus

    if message.strip():
        updated["summary"] = message.strip()

    updated["placements"] = list(current_content.get("placements") or [])
    updated["kind"] = "animation_storyboard"

    # Decide whether to regenerate scenes via LLM.
    # We regenerate when there is a meaningful topic or message change.
    topic = str(
        config.get("topic")
        or current_content.get("topic")
        or current_content.get("title")
        or message
        or "教学动画 refine"
    )
    should_regen = bool(
        message.strip()
        or config.get("topic")
        or config.get("focus")
        or config.get("visual_type")
    )

    if should_regen:
        rag_snippets = await _load_rag_snippets(
            project_id=project_id,
            query=topic,
            rag_source_ids=rag_source_ids,
        )
        llm_spec = await generate_animation_spec_with_llm(updated, rag_snippets)
        if llm_spec:
            merged = merge_llm_spec_into_content(updated, llm_spec)
            spec = normalize_animation_spec(merged)
            updated["scenes"] = spec["scenes"]
            updated["visual_type"] = spec["visual_type"]
            updated["subject_family"] = spec["subject_family"]
            updated["focus"] = spec["focus"] or updated.get("focus", "")
            updated["objects"] = spec.get("objects", [])
            updated["object_details"] = spec.get("object_details", [])
        else:
            # LLM failed – keep existing scenes, only metadata was updated above
            pass

    return updated


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


async def build_structured_refine_artifact_content(
    *,
    card_id: str,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any] | None,
    project_id: str,
    rag_source_ids: list[str] | None = None,
) -> dict[str, Any]:
    cfg = dict(config or {})
    if card_id == "knowledge_mindmap":
        return await refine_mindmap_content(
            current_content=current_content,
            message=message,
            config=cfg,
            project_id=project_id,
            rag_source_ids=rag_source_ids,
        )
    if card_id == "interactive_quick_quiz":
        return await refine_quiz_content(
            current_content=current_content,
            message=message,
            config=cfg,
            project_id=project_id,
            rag_source_ids=rag_source_ids,
        )
    if card_id == "interactive_games":
        return await refine_game_content(
            current_content=current_content,
            message=message,
            config=cfg,
            project_id=project_id,
            rag_source_ids=rag_source_ids,
        )
    if card_id == "demonstration_animations":
        return await refine_animation_content(
            current_content=current_content,
            message=message,
            config=cfg,
            project_id=project_id,
            rag_source_ids=rag_source_ids,
        )
    if card_id == "speaker_notes":
        return await refine_speaker_notes_content(
            current_content=current_content,
            message=message,
            config=cfg,
            project_id=project_id,
            rag_source_ids=rag_source_ids,
        )
    raise ValueError(f"Unsupported structured refine card: {card_id}")
