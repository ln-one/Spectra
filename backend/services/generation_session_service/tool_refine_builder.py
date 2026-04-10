from __future__ import annotations

import asyncio
import copy
import re
from typing import Any

from services.ai import ai_service
from services.generation_session_service.game_template_engine import (
    build_game_fallback_data,
    is_template_game_pattern,
    render_game_html,
    resolve_game_pattern,
    validate_game_data,
)


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
    pattern = resolve_game_pattern(
        {
            "mode": config.get("mode"),
            "game_pattern": (
                config.get("game_pattern")
                or updated.get("game_pattern")
                or current_content.get("game_pattern")
            ),
        }
    )
    rag_snippets = await _load_rag_snippets(
        project_id=project_id,
        query=str(message or updated.get("title") or "游戏热更新"),
        rag_source_ids=rag_source_ids,
    )
    patch = config.get("sandbox_patch")
    if is_template_game_pattern(pattern):
        base_game_data = updated.get("game_data")
        if not isinstance(base_game_data, dict):
            base_game_data = build_game_fallback_data(
                pattern=pattern,
                config={"topic": updated.get("title") or config.get("topic")},
                rag_snippets=rag_snippets,
            )
        game_data = copy.deepcopy(base_game_data)

        note_parts: list[str] = []
        if message.strip():
            note_parts.append(message.strip())
        if isinstance(patch, dict):
            for key in ("game_title", "instruction"):
                value = patch.get(key)
                if isinstance(value, str) and value.strip():
                    game_data[key] = value.strip()
            for key in (
                "success_message",
                "retry_message",
                "victory_message",
                "game_over_message",
            ):
                value = patch.get(key)
                if isinstance(value, str) and value.strip():
                    game_data[key] = value.strip()
            if isinstance(patch.get("total_lives"), int):
                game_data["total_lives"] = patch["total_lives"]
            replace_items = patch.get("replace")
            if isinstance(replace_items, list):
                note_parts.extend(str(item).strip() for item in replace_items if item)
            override = patch.get("override")
            if isinstance(override, dict):
                game_data.update(override)

        if note_parts:
            note_text = "；".join(part for part in note_parts if part)
            current_instruction = str(game_data.get("instruction") or "").strip()
            if current_instruction:
                game_data["instruction"] = f"{current_instruction}（更新：{note_text}）"
            else:
                game_data["instruction"] = note_text

        try:
            validate_game_data(pattern, game_data)
        except ValueError:
            game_data = base_game_data

        updated["kind"] = "interactive_game"
        updated["title"] = str(
            game_data.get("game_title") or updated.get("title") or "互动游戏"
        )
        updated["summary"] = str(game_data.get("instruction") or "已更新互动游戏配置")
        updated["game_pattern"] = pattern
        updated["game_data"] = game_data
        updated["html"] = render_game_html(pattern, game_data)
        return updated

    current_html = str(updated.get("html") or "<html><body><main></main></body></html>")
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
    updated["game_pattern"] = pattern
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
    if card_id == "speaker_notes":
        return await refine_speaker_notes_content(
            current_content=current_content,
            message=message,
            config=cfg,
            project_id=project_id,
            rag_source_ids=rag_source_ids,
        )
    raise ValueError(f"Unsupported structured refine card: {card_id}")
