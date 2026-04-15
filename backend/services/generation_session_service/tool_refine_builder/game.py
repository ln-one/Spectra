"""Interactive game structured refine."""

from __future__ import annotations

import copy
from typing import Any

from services.generation_session_service.game_template_engine import (
    build_game_fallback_data,
    is_template_game_pattern,
    render_game_html,
    resolve_game_pattern,
    validate_game_data,
)

from .common import _load_rag_snippets


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
