"""Mindmap structured refine."""

from __future__ import annotations

import copy
from typing import Any

from utils.exceptions import APIException, ErrorCode

from .common import (
    _find_mindmap_node,
    _load_rag_snippets,
    _require_manual_mindmap_title,
    _resolve_mindmap_target_id,
)


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
    target_node = _find_mindmap_node(nodes, target_id)
    if target_node is None:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="selected mindmap node is stale; refresh and retry",
        )
    query = str(
        config.get("topic") or updated.get("title") or message or "mindmap extension"
    )
    rag_snippets = await _load_rag_snippets(
        project_id=project_id,
        query=query,
        rag_source_ids=rag_source_ids,
    )
    next_index = len(nodes) + 1
    branch_title = _require_manual_mindmap_title(message)
    inserted_node_id = f"{target_id}-refine-{next_index}"
    manual_summary = str(config.get("manual_child_summary") or "").strip()
    summary = manual_summary[:220]
    if not summary:
        summary = (
            rag_snippets[0]
            if rag_snippets
            else f"New child node added for {branch_title}."
        )
    nodes.append(
        {
            "id": inserted_node_id,
            "parent_id": target_id,
            "title": branch_title,
            "summary": summary,
        }
    )
    updated["kind"] = "mindmap"
    updated["nodes"] = nodes
    updated["summary"] = f"Added a child node under {target_id}."
    updated["_inserted_node_id"] = inserted_node_id
    return updated
