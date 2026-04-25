from __future__ import annotations

import pytest

from services.generation_session_service.tool_refine_builder.interactive_games_legacy_adapter import (
    inject_legacy_game_html_section,
    refine_interactive_game_legacy_content,
)
from services.generation_session_service.tool_refine_builder.mindmap import (
    refine_mindmap_content,
)


def test_inject_legacy_game_html_section_prefers_main_tag():
    html = "<html><body><main><h1>Demo</h1></main></body></html>"
    updated = inject_legacy_game_html_section(html, "<section>Patch</section>")

    assert "<main><h1>Demo</h1><section>Patch</section></main>" in updated


@pytest.mark.asyncio
async def test_refine_interactive_game_legacy_content_preserves_template_runtime_shape(
    monkeypatch,
):
    async def _fake_load_rag_snippets(**_: object) -> list[str]:
        return ["保持时间线互动结构"]

    monkeypatch.setattr(
        "services.generation_session_service.tool_refine_builder.interactive_games_legacy_adapter._load_rag_snippets",
        _fake_load_rag_snippets,
    )

    updated = await refine_interactive_game_legacy_content(
        current_content={
            "kind": "interactive_game",
            "title": "排序挑战",
            "game_pattern": "timeline_sort",
            "game_data": {
                "game_title": "排序挑战",
                "instruction": "拖动排序",
                "events": [{"id": "evt-1", "label": "开始", "year": "1910", "hint": "提示"}],
                "correct_order": ["evt-1"],
                "success_message": "完成",
                "retry_message": "再试一次",
            },
            "html": "<html><body><main></main></body></html>",
        },
        message="加入更明确的课堂提示",
        config={"game_pattern": "timeline_sort"},
        project_id="p-001",
        rag_source_ids=None,
    )

    assert updated["kind"] == "interactive_game"
    assert updated["game_pattern"] == "timeline_sort"
    assert "html" in updated
    assert "课堂提示" in updated["summary"]


@pytest.mark.asyncio
async def test_refine_mindmap_content_supports_rename_delete_and_reparent():
    current_content = {
        "kind": "mindmap",
        "title": "牛顿第二定律",
        "nodes": [
            {"id": "root", "title": "牛顿第二定律"},
            {"id": "child-1", "parent_id": "root", "title": "合力"},
            {"id": "child-2", "parent_id": "root", "title": "加速度"},
        ],
    }

    renamed = await refine_mindmap_content(
        current_content=current_content,
        message="质量",
        config={"selected_node_path": "child-1", "node_operation": "rename"},
        project_id="p-001",
        rag_source_ids=None,
    )
    assert any(node["title"] == "质量" for node in renamed["nodes"])

    edited = await refine_mindmap_content(
        current_content=renamed,
        message="作用力",
        config={
            "selected_node_path": "child-1",
            "node_operation": "edit",
            "manual_node_summary": "描述节点在导图中的具体含义。",
        },
        project_id="p-001",
        rag_source_ids=None,
    )
    edited_node = next(node for node in edited["nodes"] if node["id"] == "child-1")
    assert edited_node["title"] == "作用力"
    assert edited_node["summary"] == "描述节点在导图中的具体含义。"

    reparented = await refine_mindmap_content(
        current_content=edited,
        message="质量",
        config={
            "selected_node_path": "child-1",
            "node_operation": "reparent",
            "new_parent_id": "child-2",
        },
        project_id="p-001",
        rag_source_ids=None,
    )
    moved = next(node for node in reparented["nodes"] if node["id"] == "child-1")
    assert moved["parent_id"] == "child-2"

    deleted = await refine_mindmap_content(
        current_content=reparented,
        message="加速度",
        config={"selected_node_path": "child-2", "node_operation": "delete"},
        project_id="p-001",
        rag_source_ids=None,
    )
    remaining_ids = {node["id"] for node in deleted["nodes"]}
    assert "child-2" not in remaining_ids
    assert "child-1" not in remaining_ids
