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


def _normalize_node_id(value: Any) -> str:
    return str(value or "").strip()


def _normalize_node_summary(value: Any) -> str:
    return str(value or "").strip()[:220]


def _delete_node_and_descendants(nodes: list[dict[str, Any]], target_id: str) -> list[dict[str, Any]]:
    descendants = {target_id}
    changed = True
    while changed:
        changed = False
        for node in nodes:
            node_id = _normalize_node_id(node.get("id"))
            parent_id = _normalize_node_id(node.get("parent_id"))
            if parent_id in descendants and node_id and node_id not in descendants:
                descendants.add(node_id)
                changed = True
    return [dict(node) for node in nodes if _normalize_node_id(node.get("id")) not in descendants]


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
    operation = str(config.get("node_operation") or "add_child").strip() or "add_child"
    if operation == "rename":
        new_title = _require_manual_mindmap_title(message)
        target_node["title"] = new_title
        updated["kind"] = "mindmap"
        updated["nodes"] = nodes
        updated["summary"] = f"Renamed node {target_id}."
        return updated
    if operation == "edit":
        new_title = _require_manual_mindmap_title(message)
        target_node["title"] = new_title
        new_summary = _normalize_node_summary(config.get("manual_node_summary"))
        if new_summary:
            target_node["summary"] = new_summary
        else:
            target_node.pop("summary", None)
        updated["kind"] = "mindmap"
        updated["nodes"] = nodes
        updated["summary"] = f"Updated node {target_id}."
        return updated
    if operation == "delete":
        if not _normalize_node_id(target_node.get("parent_id")):
            raise APIException(
                status_code=400,
                error_code=ErrorCode.INVALID_INPUT,
                message="root node cannot be deleted",
            )
        updated["kind"] = "mindmap"
        updated["nodes"] = _delete_node_and_descendants(nodes, target_id)
        updated["summary"] = f"Deleted node {target_id}."
        return updated
    if operation == "reparent":
        new_parent_id = _normalize_node_id(
            config.get("new_parent_id") or config.get("target_parent_id")
        )
        if not new_parent_id:
            raise APIException(
                status_code=400,
                error_code=ErrorCode.INVALID_INPUT,
                message="new parent node is required",
            )
        if new_parent_id == target_id:
            raise APIException(
                status_code=400,
                error_code=ErrorCode.INVALID_INPUT,
                message="node cannot be reparented under itself",
            )
        new_parent = _find_mindmap_node(nodes, new_parent_id)
        if new_parent is None:
            raise APIException(
                status_code=409,
                error_code=ErrorCode.RESOURCE_CONFLICT,
                message="target parent node is stale; refresh and retry",
            )
        current_parent = new_parent_id
        while current_parent:
            if current_parent == target_id:
                raise APIException(
                    status_code=400,
                    error_code=ErrorCode.INVALID_INPUT,
                    message="node cannot be reparented under its descendant",
                )
            parent_node = _find_mindmap_node(nodes, current_parent)
            current_parent = _normalize_node_id(parent_node.get("parent_id")) if parent_node else ""
        target_node["parent_id"] = new_parent_id
        updated["kind"] = "mindmap"
        updated["nodes"] = nodes
        updated["summary"] = f"Moved node {target_id} under {new_parent_id}."
        return updated
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
