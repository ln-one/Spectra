"""Shared structured-refine helpers."""

from __future__ import annotations

import asyncio
import re
import sys
from typing import Any

from services.ai import ai_service
from utils.exceptions import APIException, ErrorCode


def _active_ai_service():
    package = sys.modules.get(__package__)
    return getattr(package, "ai_service", ai_service)


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


def _find_mindmap_node(
    nodes: list[dict[str, Any]], target_id: str
) -> dict[str, Any] | None:
    for node in nodes:
        if str(node.get("id") or "").strip() == target_id:
            return node
    return None


def _require_manual_mindmap_title(message: str) -> str:
    title = str(message or "").strip()
    if not title:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="mindmap child node title is required",
        )
    if len(title) > 60:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="mindmap child node title must be 60 chars or fewer",
        )
    return title


async def _load_rag_snippets(
    *,
    project_id: str,
    query: str,
    rag_source_ids: list[str] | None,
) -> list[str]:
    timeout_seconds = 5.0
    filters = {"file_ids": rag_source_ids} if rag_source_ids else None
    try:
        coroutine = _active_ai_service()._retrieve_rag_context(
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
