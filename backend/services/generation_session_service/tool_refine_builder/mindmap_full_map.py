from __future__ import annotations

import json
import logging
import os
import re
import time
from collections import defaultdict, deque
from difflib import get_close_matches
from typing import Any

from services.ai.model_router import ModelRouteTask
from services.generation_session_service.mindmap_generation_support import (
    build_mindmap_review_prompt,
    resolve_requested_mindmap_depth,
    resolve_mindmap_model,
)
from services.generation_session_service.mindmap_normalizer import (
    evaluate_mindmap_payload_quality,
)
from utils.exceptions import APIException
from utils.exceptions import ErrorCode

from ..studio_card_payload_normalizers import normalize_generated_card_payload
from ..tool_content_builder_ai import generate_card_json_payload
from ..tool_content_builder_generation import _resolve_card_generation_max_tokens
from ..tool_content_builder_support import raise_generation_error, validate_card_payload
from .common import _load_rag_snippets

logger = logging.getLogger(__name__)
_CODE_LIKE_RE = re.compile(
    r"(?:function\s+\w+\(|const\s+\w+\s*=|return\s+\w+;|=>|</?[A-Za-z][^>]*>|"
    r"\bimport\s+.+\bfrom\b|\bexport\s+default\b|\bparent_id\b|\bchildren\b)",
    flags=re.IGNORECASE,
)
_NOISE_RE = re.compile(
    r"(?:\bjson\b|\bschema\b|\bchunk\b|\btoken\b|\bprompt\b|\bmarkdown\b|"
    r"\btypescript\b|\bjavascript\b|\breactflow\b|\bjsx\b|\btsx\b)",
    flags=re.IGNORECASE,
)
_PATH_LIKE_RE = re.compile(r"(?:/[\w./-]+|[A-Za-z]:\\[\w\\.-]+)")
_FILE_LIKE_RE = re.compile(r"\b[\w.-]+\.(?:ts|tsx|js|jsx|json|md|py|java|kt|sql)\b", re.IGNORECASE)
_TIMEOUT_LIKE_RE = re.compile(r"(?:time\s*out|timeout|elapsed_ms|prompt_chars)", re.IGNORECASE)
_NUMBER_HEAVY_RE = re.compile(r"(?:\b\d{3,}\b(?:\s+\d{1,4}\b){2,})")
_MARKDOWN_NOISE_RE = re.compile(r"(?:!\[[^\]]*\]\([^)]+\)|#{2,}|\*{2,}|_{2,}|\[[^\]]+\]\([^)]+\))")
_LOCAL_REFINE_HINT_RE = re.compile(
    r"(?:给|把|将|对|围绕|针对).{0,24}(?:节点|分支)|(?:增加|新增|扩展|展开|补充|细化|延展).{0,18}(?:节点|分支|层|级)",
    re.IGNORECASE,
)
_FULL_MAP_HINT_RE = re.compile(
    r"(?:整张导图|全图|整个导图|重新组织一级分支|重组整图|重写整图|整体重写|压缩全图|全局改写)",
    re.IGNORECASE,
)
_QUOTED_TARGET_RE = re.compile(r"[\"“”'‘’]([^\"“”'‘’]{1,40})[\"“”'‘’]")


def _env_positive_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
        return value if value > 0 else default
    except ValueError:
        return default


def resolve_mindmap_refine_model() -> str | None:
    explicit_model = str(os.getenv("MINDMAP_REFINE_MODEL", "") or "").strip()
    if explicit_model:
        return explicit_model

    generation_model = resolve_mindmap_model()
    tier = str(os.getenv("MINDMAP_REFINE_MODEL_TIER", "") or "").strip().lower()
    if not tier:
        return generation_model

    explicit_quality_model = str(os.getenv("MINDMAP_QUALITY_MODEL", "") or "").strip()
    shared_quality_model = str(os.getenv("QUALITY_MODEL", "") or "").strip()
    if tier == "quality":
        return explicit_quality_model or shared_quality_model or generation_model
    if tier == "default":
        from services.ai import ai_service

        return generation_model or ai_service.default_model
    if tier == "small":
        from services.ai import ai_service

        return generation_model or ai_service.small_model
    return generation_model


def resolve_mindmap_refine_max_tokens() -> int:
    generation_floor = _resolve_card_generation_max_tokens("knowledge_mindmap")
    explicit_refine_limit = _env_positive_int("MINDMAP_REFINE_MAX_TOKENS", generation_floor)
    return max(generation_floor, explicit_refine_limit)


def resolve_mindmap_timeout_seconds() -> float | None:
    raw = str(os.getenv("MINDMAP_TIMEOUT_SECONDS", "") or "").strip()
    if not raw:
        return None
    try:
        value = float(raw)
        return value if value > 0 else None
    except ValueError:
        return None


def resolve_mindmap_refine_timeout_seconds() -> float | None:
    raw = str(os.getenv("MINDMAP_REFINE_TIMEOUT_SECONDS", "") or "").strip()
    if not raw:
        return resolve_mindmap_timeout_seconds()
    try:
        value = float(raw)
        return value if value > 0 else resolve_mindmap_timeout_seconds()
    except ValueError:
        return resolve_mindmap_timeout_seconds()


def resolve_mindmap_refine_review_max_tokens() -> int:
    generation_review_floor = max(
        _resolve_card_generation_max_tokens("knowledge_mindmap"),
        _env_positive_int("MINDMAP_REVIEW_MAX_TOKENS", 5200),
    )
    explicit_refine_limit = _env_positive_int(
        "MINDMAP_REFINE_REVIEW_MAX_TOKENS",
        generation_review_floor,
    )
    return max(generation_review_floor, explicit_refine_limit)


def resolve_mindmap_review_timeout_seconds() -> float | None:
    raw = str(os.getenv("MINDMAP_REVIEW_TIMEOUT_SECONDS", "") or "").strip()
    if not raw:
        return resolve_mindmap_refine_timeout_seconds()
    try:
        value = float(raw)
        return value if value > 0 else resolve_mindmap_refine_timeout_seconds()
    except ValueError:
        return resolve_mindmap_refine_timeout_seconds()


def build_full_map_refine_config(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
) -> dict[str, Any]:
    next_config = dict(config)
    next_config.setdefault("title", current_content.get("title"))
    next_config.setdefault("topic", current_content.get("title"))
    if not str(next_config.get("output_requirements") or "").strip():
        next_config["output_requirements"] = message
    requested_depth = resolve_requested_mindmap_depth(next_config, message)
    if requested_depth:
        next_config["depth"] = requested_depth
    return next_config


def build_mindmap_refine_prompt(
    *,
    current_snapshot: dict[str, Any],
    message: str,
    rag_snippets: list[str],
    requested_depth: int | None = None,
) -> str:
    rag_block = json.dumps(rag_snippets, ensure_ascii=False) if rag_snippets else "[]"
    depth_requirement = (
        f"- The user explicitly requested at least {requested_depth} levels. The rewritten map must reach depth {requested_depth} or more unless the topic truly cannot support it.\n"
        if requested_depth and requested_depth > 0
        else ""
    )
    return (
        "You are revising an existing educational mind map.\n"
        "Return ONLY one JSON object. Do not include markdown fences or explanations.\n"
        "This is a full-map rewrite, not a local patch.\n"
        f"User refinement instruction: {message}\n"
        f"Current mind map snapshot: {json.dumps(current_snapshot, ensure_ascii=False)}\n"
        f"Optional evidence snippets: {rag_block}\n"
        "Rewrite requirements:\n"
        "- Rewrite from the current map structure first; use evidence only when it helps expand or clarify.\n"
        "- Keep the topic coherent with the current map unless the instruction explicitly changes scope.\n"
        "- Preserve or improve overall richness, branch balance, and teaching usefulness.\n"
        "- Do not collapse the map into a smaller or shallower tree.\n"
        f"{depth_requirement}"
        "- Clean out RAG residue, filenames, chunk markers, source traces, and quoted-fragment tone.\n"
        "- Titles must stay short and node-friendly.\n"
        "- Summaries must be synthesized, concise, and classroom-ready.\n"
        "- Return a JSON object with shape: {title, summary, nodes:[{id,parent_id,title,summary}]}\n"
        "- Do not return edges, metadata, renderer hints, or explanations.\n"
    )


def summarize_mindmap_for_rewrite(current_content: dict[str, Any]) -> dict[str, Any]:
    nodes = []
    raw_nodes = current_content.get("nodes") or []
    for raw_node in raw_nodes:
        if not isinstance(raw_node, dict):
            continue
        node = {
            "id": str(raw_node.get("id") or "").strip()[:48],
            "parent_id": raw_node.get("parent_id"),
            "title": str(raw_node.get("title") or "").strip()[:48],
        }
        summary = str(raw_node.get("summary") or "").strip()
        if summary:
            node["summary"] = summary[:120]
        nodes.append(node)
    return {
        "title": str(current_content.get("title") or "").strip()[:64],
        "summary": str(current_content.get("summary") or "").strip()[:180],
        "nodes": nodes,
    }


def _normalize_match_text(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "").strip().lower())


def _build_node_maps(
    current_content: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], dict[str, list[str]], str]:
    nodes = [
        dict(node)
        for node in (current_content.get("nodes") or [])
        if isinstance(node, dict) and str(node.get("id") or "").strip()
    ]
    node_by_id = {str(node.get("id") or "").strip(): node for node in nodes}
    children_map: dict[str, list[str]] = defaultdict(list)
    root_id = ""
    for node in nodes:
        node_id = str(node.get("id") or "").strip()
        parent_id = str(node.get("parent_id") or "").strip()
        if parent_id and parent_id in node_by_id:
            children_map[parent_id].append(node_id)
        elif not root_id:
            root_id = node_id
    if not root_id and nodes:
        root_id = str(nodes[0].get("id") or "").strip()
    return nodes, node_by_id, children_map, root_id


def _is_explicit_full_map_instruction(message: str) -> bool:
    return bool(_FULL_MAP_HINT_RE.search(message or ""))


def _extract_target_candidate_texts(message: str) -> list[str]:
    text = str(message or "").strip()
    candidates: list[str] = []
    for match in _QUOTED_TARGET_RE.findall(text):
        cleaned = str(match or "").strip()
        if cleaned:
            candidates.append(cleaned)

    node_phrase_patterns = [
        re.compile(r"给\s*([^，。；,\n]{1,40}?)(?:节点|分支)"),
        re.compile(r"把\s*([^，。；,\n]{1,40}?)(?:节点|分支)"),
        re.compile(r"针对\s*([^，。；,\n]{1,40}?)(?:节点|分支)"),
        re.compile(r"围绕\s*([^，。；,\n]{1,40}?)(?:节点|分支)"),
    ]
    for pattern in node_phrase_patterns:
        match = pattern.search(text)
        if not match:
            continue
        cleaned = str(match.group(1) or "").strip(" ：:，。,.;；“”\"'‘’")
        if cleaned:
            candidates.append(cleaned)
    return candidates


def _resolve_target_node(
    *,
    current_content: dict[str, Any],
    message: str,
) -> tuple[str | None, str | None, list[str]]:
    _nodes, node_by_id, _children_map, _root_id = _build_node_maps(current_content)
    title_pairs: list[tuple[str, str, str]] = []
    for node_id, node in node_by_id.items():
        title = str(node.get("title") or node.get("label") or "").strip()
        if not title:
            continue
        title_pairs.append((node_id, title, _normalize_match_text(title)))

    candidate_texts = _extract_target_candidate_texts(message)
    normalized_message = _normalize_match_text(message)
    for target_text in candidate_texts:
        normalized_target = _normalize_match_text(target_text)
        for node_id, title, normalized_title in title_pairs:
            if normalized_target == normalized_title:
                return node_id, title, []
        for node_id, title, normalized_title in title_pairs:
            if normalized_target and normalized_target in normalized_title:
                return node_id, title, []

    keyword_hits: list[tuple[str, str]] = []
    for node_id, title, normalized_title in title_pairs:
        if normalized_title and normalized_title in normalized_message:
            keyword_hits.append((node_id, title))
    if len(keyword_hits) == 1:
        node_id, title = keyword_hits[0]
        return node_id, title, []

    title_lookup = {normalized_title: title for _, title, normalized_title in title_pairs}
    fuzzy_candidates = get_close_matches(
        "".join(candidate_texts) or normalized_message[:32],
        list(title_lookup.keys()),
        n=4,
        cutoff=0.42,
    )
    candidate_titles = [title_lookup[key] for key in fuzzy_candidates if key in title_lookup]
    return None, None, candidate_titles


def _infer_refine_scope(
    *,
    current_content: dict[str, Any],
    message: str,
) -> tuple[str, str | None, str | None, list[str]]:
    instruction = str(message or "").strip()
    if _is_explicit_full_map_instruction(instruction):
        return "full_map_rewrite", None, None, []
    if not _LOCAL_REFINE_HINT_RE.search(instruction):
        return "full_map_rewrite", None, None, []

    target_node_id, target_node_title, candidate_titles = _resolve_target_node(
        current_content=current_content,
        message=instruction,
    )
    if target_node_id:
        return "local_subtree_refine", target_node_id, target_node_title, []
    return "local_subtree_refine", None, None, candidate_titles


def _collect_subtree_ids(children_map: dict[str, list[str]], target_id: str) -> set[str]:
    collected = {target_id}
    queue = deque([target_id])
    while queue:
        current = queue.popleft()
        for child_id in children_map.get(current, []):
            if child_id in collected:
                continue
            collected.add(child_id)
            queue.append(child_id)
    return collected


def _compact_subtree_snapshot(
    *,
    current_content: dict[str, Any],
    target_node_id: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    nodes, node_by_id, children_map, root_id = _build_node_maps(current_content)
    if target_node_id not in node_by_id:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="selected mindmap node is stale; refresh and retry",
        )
    subtree_ids = _collect_subtree_ids(children_map, target_node_id)
    subtree_nodes = []
    sibling_summaries: list[dict[str, str]] = []
    ancestor_chain: list[dict[str, str]] = []
    target_node = node_by_id[target_node_id]
    parent_id = str(target_node.get("parent_id") or "").strip() or None

    for node_id in subtree_ids:
        node = node_by_id[node_id]
        compact = {
            "id": str(node.get("id") or "").strip()[:48],
            "parent_id": (
                str(node.get("parent_id") or "").strip() if node_id != target_node_id else None
            ),
            "title": str(node.get("title") or "").strip()[:48],
        }
        summary = str(node.get("summary") or "").strip()
        if summary:
            compact["summary"] = summary[:120]
        subtree_nodes.append(compact)

    current_parent_id = parent_id
    while current_parent_id and current_parent_id in node_by_id:
        ancestor = node_by_id[current_parent_id]
        ancestor_chain.append(
            {
                "id": current_parent_id,
                "title": str(ancestor.get("title") or "").strip()[:48],
            }
        )
        next_parent = str(ancestor.get("parent_id") or "").strip()
        if not next_parent or next_parent == current_parent_id:
            break
        current_parent_id = next_parent

    if parent_id and parent_id in node_by_id:
        for sibling_id in children_map.get(parent_id, []):
            if sibling_id == target_node_id or sibling_id not in node_by_id:
                continue
            sibling = node_by_id[sibling_id]
            sibling_summaries.append(
                {
                    "id": sibling_id,
                    "title": str(sibling.get("title") or "").strip()[:48],
                    "summary": str(sibling.get("summary") or "").strip()[:80],
                }
            )

    snapshot = {
        "title": str(current_content.get("title") or "").strip()[:64],
        "summary": str(current_content.get("summary") or "").strip()[:160],
        "target_node_id": target_node_id,
        "target_node_title": str(target_node.get("title") or "").strip()[:48],
        "ancestor_chain": list(reversed(ancestor_chain[-4:])),
        "sibling_summaries": sibling_summaries[:5],
        "subtree_nodes": sorted(subtree_nodes, key=lambda item: (str(item.get("parent_id") or ""), item["id"])),
    }
    context = {
        "root_id": root_id,
        "parent_id": parent_id,
        "target_node": target_node,
        "subtree_ids": subtree_ids,
        "subtree_node_count": len(subtree_ids),
        "subtree_depth": _compute_subtree_depth(children_map, target_node_id),
    }
    return snapshot, context


def _compute_subtree_depth(children_map: dict[str, list[str]], target_id: str) -> int:
    max_depth = 1
    queue = deque([(target_id, 1)])
    while queue:
        current, depth = queue.popleft()
        max_depth = max(max_depth, depth)
        for child_id in children_map.get(current, []):
            queue.append((child_id, depth + 1))
    return max_depth


def _sanitize_refine_rag_text(text: str) -> str:
    candidate = re.sub(r"\s+", " ", str(text or "").replace("\r", " ").replace("\n", " ")).strip()
    candidate = _PATH_LIKE_RE.sub(" ", candidate)
    candidate = _FILE_LIKE_RE.sub(" ", candidate)
    candidate = _MARKDOWN_NOISE_RE.sub(" ", candidate)
    candidate = re.sub(r"[`~|^]{2,}", " ", candidate)
    candidate = re.sub(r"\s+", " ", candidate).strip(" -:;,.")
    return candidate


def _is_bad_refine_rag_snippet(text: str) -> bool:
    if not text or len(text) < 16:
        return True
    if _CODE_LIKE_RE.search(text):
        return True
    if _NOISE_RE.search(text):
        return True
    if _TIMEOUT_LIKE_RE.search(text):
        return True
    if _NUMBER_HEAVY_RE.search(text):
        return True
    if _MARKDOWN_NOISE_RE.search(text):
        return True
    digit_count = sum(1 for ch in text if ch.isdigit())
    if digit_count / max(len(text), 1) > 0.22:
        return True
    symbol_count = sum(
        1
        for ch in text
        if not ch.isalnum() and not ("\u4e00" <= ch <= "\u9fff") and ch != " "
    )
    if symbol_count / max(len(text), 1) > 0.18:
        return True
    return False


async def load_refine_rag_snippets(
    *,
    project_id: str,
    query: str,
    rag_source_ids: list[str] | None,
) -> list[str]:
    raw_snippets = await _load_rag_snippets(
        project_id=project_id,
        query=query,
        rag_source_ids=rag_source_ids,
    )
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw_snippet in raw_snippets:
        sanitized = _sanitize_refine_rag_text(raw_snippet)
        if _is_bad_refine_rag_snippet(sanitized):
            continue
        compact = sanitized[:160]
        dedupe_key = re.sub(r"\s+", "", compact.lower())
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        cleaned.append(compact)
    return cleaned[:2]


def build_local_subtree_refine_prompt(
    *,
    current_snapshot: dict[str, Any],
    message: str,
    rag_snippets: list[str],
    requested_depth: int | None = None,
) -> str:
    rag_block = json.dumps(rag_snippets, ensure_ascii=False) if rag_snippets else "[]"
    depth_requirement = (
        f"- The user explicitly requested at least {requested_depth} levels for this branch. Expand the target subtree to depth {requested_depth} or deeper if the topic supports it.\n"
        if requested_depth and requested_depth > 0
        else ""
    )
    return (
        "You are revising one targeted branch inside an educational mind map.\n"
        "Return ONLY one JSON object. Do not include markdown fences or explanations.\n"
        "This is a local subtree rewrite anchored to the target node, not a whole-map rewrite.\n"
        f"User refinement instruction: {message}\n"
        f"Target subtree snapshot: {json.dumps(current_snapshot, ensure_ascii=False)}\n"
        f"Optional evidence snippets: {rag_block}\n"
        "Local rewrite requirements:\n"
        "- Keep the target node as the subtree root and preserve its topic identity.\n"
        "- Expand or rewrite only this branch; do not rewrite sibling branches or the overall root theme.\n"
        "- Return only the target subtree as flat nodes.\n"
        "- The subtree root must remain present in the returned nodes.\n"
        "- Set the subtree root parent_id to null inside the returned payload.\n"
        "- Child nodes must attach under the target subtree root or its descendants.\n"
        "- Favor meaningful branch growth over generic filler.\n"
        "- Allow asymmetry: this branch may become deeper or denser than siblings.\n"
        f"{depth_requirement}"
        "- Clean out RAG residue, filenames, chunk markers, source traces, and quoted-fragment tone.\n"
        "- Titles should stay concise and node-friendly.\n"
        "- Summaries must be synthesized and classroom-ready.\n"
        "- Return a JSON object with shape: {title, summary, nodes:[{id,parent_id,title,summary}]}\n"
    )


def _uniquify_subtree_nodes(
    *,
    subtree_nodes: list[dict[str, Any]],
    target_node_id: str,
    target_parent_id: str | None,
    occupied_ids: set[str],
) -> list[dict[str, Any]]:
    remapped: list[dict[str, Any]] = []
    id_map: dict[str, str] = {}
    subtree_root_original_id = next(
        (
            str(node.get("id") or "").strip()
            for node in subtree_nodes
            if not str(node.get("parent_id") or "").strip()
        ),
        str(subtree_nodes[0].get("id") or "").strip() if subtree_nodes else target_node_id,
    )
    for index, raw_node in enumerate(subtree_nodes, start=1):
        original_id = str(raw_node.get("id") or "").strip() or f"branch-node-{index}"
        next_id = (
            target_node_id
            if original_id in {target_node_id, subtree_root_original_id}
            else original_id
        )
        if next_id != target_node_id:
            base_id = re.sub(r"[^\w\-]+", "-", next_id).strip("-").lower() or f"branch-node-{index}"
            next_id = base_id[:48]
            suffix = 2
            while next_id in occupied_ids or next_id in id_map.values():
                next_id = f"{base_id[:40]}-{suffix}"
                suffix += 1
        id_map[original_id] = next_id

    for index, raw_node in enumerate(subtree_nodes, start=1):
        original_id = str(raw_node.get("id") or "").strip() or f"branch-node-{index}"
        next_id = id_map[original_id]
        parent_id = str(raw_node.get("parent_id") or "").strip()
        normalized_parent = (
            None
            if next_id == target_node_id
            else id_map.get(parent_id) or target_node_id
        )
        node = {
            "id": next_id,
            "parent_id": target_parent_id if next_id == target_node_id else normalized_parent,
            "title": str(raw_node.get("title") or "").strip(),
        }
        summary = str(raw_node.get("summary") or "").strip()
        if summary:
            node["summary"] = summary
        remapped.append(node)
    return remapped


def merge_local_subtree_payload(
    *,
    current_content: dict[str, Any],
    normalized_subtree: dict[str, Any],
    target_node_id: str,
) -> tuple[dict[str, Any], dict[str, int]]:
    nodes, node_by_id, children_map, _root_id = _build_node_maps(current_content)
    if target_node_id not in node_by_id:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="selected mindmap node is stale; refresh and retry",
        )
    subtree_ids = _collect_subtree_ids(children_map, target_node_id)
    target_parent_id = str(node_by_id[target_node_id].get("parent_id") or "").strip() or None
    outside_nodes = [dict(node) for node in nodes if str(node.get("id") or "").strip() not in subtree_ids]
    occupied_ids = {str(node.get("id") or "").strip() for node in outside_nodes}
    rewritten_nodes = [
        dict(node)
        for node in (normalized_subtree.get("nodes") or [])
        if isinstance(node, dict)
    ]
    if not rewritten_nodes:
        raise_generation_error(
            status_code=422,
            error_code=ErrorCode.INVALID_INPUT,
            message="Local subtree refine returned an empty subtree.",
            card_id="knowledge_mindmap",
            phase="normalize",
            failure_reason="mindmap_local_subtree_empty",
            retryable=False,
        )
    merged_subtree_nodes = _uniquify_subtree_nodes(
        subtree_nodes=rewritten_nodes,
        target_node_id=target_node_id,
        target_parent_id=target_parent_id,
        occupied_ids=occupied_ids,
    )
    merged_nodes = outside_nodes + merged_subtree_nodes
    merged = {
        "kind": "mindmap",
        "title": str(current_content.get("title") or "").strip()
        or str(normalized_subtree.get("title") or "").strip(),
        "summary": str(current_content.get("summary") or "").strip()
        or str(normalized_subtree.get("summary") or "").strip(),
        "nodes": merged_nodes,
    }
    merged_metrics = {
        "subtree_before_node_count": len(subtree_ids),
        "subtree_after_node_count": len(merged_subtree_nodes),
    }
    return merged, merged_metrics


def log_refine_phase(
    phase: str,
    *,
    started_at: float,
    model: str | None = None,
    max_tokens: int | None = None,
    timeout_seconds: float | None = None,
    prompt_chars: int | None = None,
    node_count: int | None = None,
    rag_snippet_count: int | None = None,
    refine_scope: str | None = None,
    target_node_id: str | None = None,
) -> None:
    logger.info(
        "knowledge_mindmap refine phase=%s elapsed_ms=%.2f model=%s max_tokens=%s timeout_seconds=%s prompt_chars=%s node_count=%s rag_snippet_count=%s refine_scope=%s target_node_id=%s",
        phase,
        (time.perf_counter() - started_at) * 1000.0,
        model or "-",
        max_tokens if max_tokens is not None else "-",
        timeout_seconds if timeout_seconds is not None else "-",
        prompt_chars if prompt_chars is not None else "-",
        node_count if node_count is not None else "-",
        rag_snippet_count if rag_snippet_count is not None else "-",
        refine_scope or "-",
        target_node_id or "-",
    )


def enforce_mindmap_refine_quality(
    *,
    payload: dict[str, Any],
    current_content: dict[str, Any],
    model_name: str | None,
    requested_depth: int | None = None,
    refine_scope: str = "full_map_rewrite",
    target_node_title: str | None = None,
    subtree_before_node_count: int | None = None,
    subtree_after_node_count: int | None = None,
) -> None:
    quality_threshold = _env_positive_int("MINDMAP_QUALITY_THRESHOLD", 70)
    score, issues, metrics = evaluate_mindmap_payload_quality(payload)
    current_score, current_issues, current_metrics = evaluate_mindmap_payload_quality(
        current_content
    )
    regression_issues: list[str] = []

    current_node_count = int(current_metrics.get("node_count") or 0)
    next_node_count = int(metrics.get("node_count") or 0)
    current_depth = int(current_metrics.get("max_depth") or 0)
    next_depth = int(metrics.get("max_depth") or 0)
    current_duplicates = int(current_metrics.get("duplicate_title_count") or 0)
    next_duplicates = int(metrics.get("duplicate_title_count") or 0)
    current_noise = int(current_metrics.get("noise_hits") or 0)
    next_noise = int(metrics.get("noise_hits") or 0)
    current_avg_title_length = int(current_metrics.get("avg_title_length") or 0)
    next_avg_title_length = int(metrics.get("avg_title_length") or 0)

    if current_node_count >= 12 and next_node_count < max(12, int(current_node_count * 0.75)):
        regression_issues.append("rewrite_shrank_nodes")
    if current_depth >= 4 and next_depth < max(4, current_depth - 1):
        regression_issues.append("rewrite_shrank_depth")
    if next_duplicates > current_duplicates + 1:
        regression_issues.append("rewrite_increased_duplicates")
    if next_noise > current_noise:
        regression_issues.append("rewrite_reintroduced_rag_noise")
    if next_avg_title_length > max(18, current_avg_title_length + 2):
        regression_issues.append("rewrite_titles_more_verbose")
    if (
        refine_scope == "local_subtree_refine"
        and subtree_before_node_count is not None
        and subtree_after_node_count is not None
        and subtree_after_node_count < subtree_before_node_count
    ):
        regression_issues.append("local_subtree_shrank")

    logger.info(
        "knowledge_mindmap refine quality metadata: model=%s score=%s threshold=%s requested_depth=%s refine_scope=%s target_node_title=%s issues=%s metrics=%s current_score=%s current_issues=%s current_metrics=%s regression_issues=%s subtree_before_node_count=%s subtree_after_node_count=%s",
        model_name,
        score,
        quality_threshold,
        requested_depth if requested_depth is not None else "-",
        refine_scope,
        target_node_title or "-",
        ",".join(issues),
        metrics,
        current_score,
        ",".join(current_issues),
        current_metrics,
        ",".join(regression_issues),
        subtree_before_node_count if subtree_before_node_count is not None else "-",
        subtree_after_node_count if subtree_after_node_count is not None else "-",
    )
    if requested_depth and requested_depth > 0 and next_depth < requested_depth:
        logger.warning(
            "knowledge_mindmap refine depth target not met: requested_depth=%s current_depth=%s next_depth=%s model=%s",
            requested_depth,
            current_depth,
            next_depth,
            model_name or "-",
        )

    if score < quality_threshold or regression_issues:
        failure_reasons = issues[:]
        failure_reasons.extend(regression_issues)
        raise_generation_error(
            status_code=422,
            error_code=ErrorCode.INVALID_INPUT,
            message="Refined mindmap payload failed quality score checks.",
            card_id="knowledge_mindmap",
            model=model_name,
            phase="quality_gate",
            failure_reason="mindmap_refine_quality_low:" + ",".join(failure_reasons[:8]),
            retryable=False,
            extra={
                "mindmap_quality_score": score,
                "mindmap_quality_threshold": quality_threshold,
                "mindmap_quality_metrics": metrics,
                "mindmap_quality_regressions": regression_issues,
                "current_mindmap_quality_metrics": current_metrics,
            },
        )


async def _rewrite_full_map(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
    project_id: str,
    rag_source_ids: list[str] | None,
    started_at: float,
) -> dict[str, Any]:
    instruction = str(message or "").strip()
    current_snapshot = summarize_mindmap_for_rewrite(current_content)
    node_count = len(current_snapshot.get("nodes") or [])
    rag_snippets = await load_refine_rag_snippets(
        project_id=project_id,
        query=instruction,
        rag_source_ids=rag_source_ids,
    )
    log_refine_phase(
        "prepare_prompt",
        started_at=started_at,
        node_count=node_count,
        rag_snippet_count=len(rag_snippets),
        refine_scope="full_map_rewrite",
    )
    refine_config = build_full_map_refine_config(
        current_content=current_content,
        message=instruction,
        config=config,
    )
    requested_depth = resolve_requested_mindmap_depth(refine_config, instruction)
    model = resolve_mindmap_refine_model()
    refine_timeout_seconds = resolve_mindmap_refine_timeout_seconds()
    refine_max_tokens = resolve_mindmap_refine_max_tokens()
    generation_prompt = build_mindmap_refine_prompt(
        current_snapshot=current_snapshot,
        message=instruction,
        rag_snippets=rag_snippets,
        requested_depth=requested_depth,
    )
    payload, model_name = await generate_card_json_payload(
        prompt=generation_prompt,
        card_id="knowledge_mindmap",
        phase="generate",
        rag_snippets=rag_snippets,
        max_tokens=refine_max_tokens,
        route_task=ModelRouteTask.LESSON_PLAN_REASONING,
        model=model,
        timeout_seconds_override=refine_timeout_seconds,
    )
    log_refine_phase(
        "generate_rewrite",
        started_at=started_at,
        model=model_name,
        max_tokens=refine_max_tokens,
        timeout_seconds=refine_timeout_seconds,
        prompt_chars=len(generation_prompt),
        node_count=node_count,
        rag_snippet_count=len(rag_snippets),
        refine_scope="full_map_rewrite",
    )

    reviewed_payload = payload
    if str(os.getenv("MINDMAP_REVIEW_ENABLED", "true") or "").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }:
        review_timeout_seconds = resolve_mindmap_review_timeout_seconds()
        review_max_tokens = resolve_mindmap_refine_review_max_tokens()
        review_prompt = build_mindmap_review_prompt(
            config=refine_config,
            draft_payload=payload,
            rag_snippets=rag_snippets,
            instruction=instruction,
        )
        reviewed_payload, reviewed_model_name = await generate_card_json_payload(
            prompt=review_prompt,
            card_id="knowledge_mindmap",
            phase="review",
            rag_snippets=rag_snippets,
            max_tokens=review_max_tokens,
            route_task=ModelRouteTask.LESSON_PLAN_REASONING,
            model=model,
            timeout_seconds_override=review_timeout_seconds,
        )
        model_name = reviewed_model_name or model_name
        log_refine_phase(
            "review_rewrite",
            started_at=started_at,
            model=model_name,
            max_tokens=review_max_tokens,
            timeout_seconds=review_timeout_seconds,
            prompt_chars=len(review_prompt),
            node_count=node_count,
            rag_snippet_count=len(rag_snippets),
            refine_scope="full_map_rewrite",
        )

    normalized = normalize_generated_card_payload(
        card_id="knowledge_mindmap",
        payload=reviewed_payload,
        config=refine_config,
    )
    log_refine_phase(
        "normalize",
        started_at=started_at,
        model=model_name,
        node_count=len(normalized.get("nodes") or []),
        rag_snippet_count=len(rag_snippets),
        refine_scope="full_map_rewrite",
    )
    validate_card_payload("knowledge_mindmap", normalized)
    enforce_mindmap_refine_quality(
        payload=normalized,
        current_content=current_content,
        model_name=model_name,
        requested_depth=requested_depth,
        refine_scope="full_map_rewrite",
    )
    log_refine_phase(
        "quality_gate",
        started_at=started_at,
        model=model_name,
        node_count=len(normalized.get("nodes") or []),
        rag_snippet_count=len(rag_snippets),
        refine_scope="full_map_rewrite",
    )
    normalized["kind"] = "mindmap"
    normalized["summary"] = str(
        normalized.get("summary") or current_content.get("summary") or instruction
    ).strip()
    log_refine_phase(
        "persist_artifact",
        started_at=started_at,
        model=model_name,
        node_count=len(normalized.get("nodes") or []),
        rag_snippet_count=len(rag_snippets),
        refine_scope="full_map_rewrite",
    )
    return normalized


async def _rewrite_local_subtree(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
    project_id: str,
    rag_source_ids: list[str] | None,
    started_at: float,
    target_node_id: str,
    target_node_title: str,
) -> dict[str, Any]:
    instruction = str(message or "").strip()
    subtree_snapshot, subtree_context = _compact_subtree_snapshot(
        current_content=current_content,
        target_node_id=target_node_id,
    )
    rag_query = f"{target_node_title} {instruction}".strip()
    rag_snippets = await load_refine_rag_snippets(
        project_id=project_id,
        query=rag_query,
        rag_source_ids=rag_source_ids,
    )
    log_refine_phase(
        "prepare_prompt",
        started_at=started_at,
        node_count=int(subtree_context.get("subtree_node_count") or 0),
        rag_snippet_count=len(rag_snippets),
        refine_scope="local_subtree_refine",
        target_node_id=target_node_id,
    )
    refine_config = build_full_map_refine_config(
        current_content=current_content,
        message=instruction,
        config=config,
    )
    requested_depth = resolve_requested_mindmap_depth(refine_config, instruction)
    model = resolve_mindmap_refine_model()
    refine_timeout_seconds = resolve_mindmap_refine_timeout_seconds()
    refine_max_tokens = resolve_mindmap_refine_max_tokens()
    generation_prompt = build_local_subtree_refine_prompt(
        current_snapshot=subtree_snapshot,
        message=instruction,
        rag_snippets=rag_snippets,
        requested_depth=requested_depth,
    )
    payload, model_name = await generate_card_json_payload(
        prompt=generation_prompt,
        card_id="knowledge_mindmap",
        phase="generate",
        rag_snippets=rag_snippets,
        max_tokens=refine_max_tokens,
        route_task=ModelRouteTask.LESSON_PLAN_REASONING,
        model=model,
        timeout_seconds_override=refine_timeout_seconds,
    )
    log_refine_phase(
        "generate_rewrite",
        started_at=started_at,
        model=model_name,
        max_tokens=refine_max_tokens,
        timeout_seconds=refine_timeout_seconds,
        prompt_chars=len(generation_prompt),
        node_count=int(subtree_context.get("subtree_node_count") or 0),
        rag_snippet_count=len(rag_snippets),
        refine_scope="local_subtree_refine",
        target_node_id=target_node_id,
    )

    reviewed_payload = payload
    if str(os.getenv("MINDMAP_REVIEW_ENABLED", "true") or "").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }:
        review_timeout_seconds = resolve_mindmap_review_timeout_seconds()
        review_max_tokens = resolve_mindmap_refine_review_max_tokens()
        review_prompt = build_mindmap_review_prompt(
            config=refine_config,
            draft_payload=payload,
            rag_snippets=rag_snippets,
            instruction=f"仅重写节点“{target_node_title}”对应的子树：{instruction}",
        )
        reviewed_payload, reviewed_model_name = await generate_card_json_payload(
            prompt=review_prompt,
            card_id="knowledge_mindmap",
            phase="review",
            rag_snippets=rag_snippets,
            max_tokens=review_max_tokens,
            route_task=ModelRouteTask.LESSON_PLAN_REASONING,
            model=model,
            timeout_seconds_override=review_timeout_seconds,
        )
        model_name = reviewed_model_name or model_name
        log_refine_phase(
            "review_rewrite",
            started_at=started_at,
            model=model_name,
            max_tokens=review_max_tokens,
            timeout_seconds=review_timeout_seconds,
            prompt_chars=len(review_prompt),
            node_count=int(subtree_context.get("subtree_node_count") or 0),
            rag_snippet_count=len(rag_snippets),
            refine_scope="local_subtree_refine",
            target_node_id=target_node_id,
        )

    normalized_subtree = normalize_generated_card_payload(
        card_id="knowledge_mindmap",
        payload=reviewed_payload,
        config=refine_config,
    )
    merged, subtree_metrics = merge_local_subtree_payload(
        current_content=current_content,
        normalized_subtree=normalized_subtree,
        target_node_id=target_node_id,
    )
    normalized = normalize_generated_card_payload(
        card_id="knowledge_mindmap",
        payload=merged,
        config=refine_config,
    )
    log_refine_phase(
        "normalize",
        started_at=started_at,
        model=model_name,
        node_count=len(normalized.get("nodes") or []),
        rag_snippet_count=len(rag_snippets),
        refine_scope="local_subtree_refine",
        target_node_id=target_node_id,
    )
    validate_card_payload("knowledge_mindmap", normalized)
    enforce_mindmap_refine_quality(
        payload=normalized,
        current_content=current_content,
        model_name=model_name,
        requested_depth=requested_depth,
        refine_scope="local_subtree_refine",
        target_node_title=target_node_title,
        subtree_before_node_count=subtree_metrics.get("subtree_before_node_count"),
        subtree_after_node_count=subtree_metrics.get("subtree_after_node_count"),
    )
    log_refine_phase(
        "quality_gate",
        started_at=started_at,
        model=model_name,
        node_count=len(normalized.get("nodes") or []),
        rag_snippet_count=len(rag_snippets),
        refine_scope="local_subtree_refine",
        target_node_id=target_node_id,
    )
    normalized["kind"] = "mindmap"
    normalized["summary"] = str(
        normalized.get("summary")
        or current_content.get("summary")
        or f"已按要求重写节点“{target_node_title}”对应分支。"
    ).strip()
    log_refine_phase(
        "persist_artifact",
        started_at=started_at,
        model=model_name,
        node_count=len(normalized.get("nodes") or []),
        rag_snippet_count=len(rag_snippets),
        refine_scope="local_subtree_refine",
        target_node_id=target_node_id,
    )
    return normalized


async def rewrite_full_mindmap(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
    project_id: str,
    rag_source_ids: list[str] | None,
) -> dict[str, Any]:
    instruction = str(message or "").strip()
    if not instruction:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="mindmap chat refine requires a non-empty instruction",
        )

    started_at = time.perf_counter()
    refine_scope, target_node_id, target_node_title, candidate_titles = _infer_refine_scope(
        current_content=current_content,
        message=instruction,
    )
    if refine_scope == "local_subtree_refine":
        if not target_node_id or not target_node_title:
            raise_generation_error(
                status_code=422,
                error_code=ErrorCode.INVALID_INPUT,
                message="Mindmap refine could not match the requested node. Please name an existing node more explicitly.",
                card_id="knowledge_mindmap",
                model=None,
                phase="prepare_prompt",
                failure_reason="mindmap_target_node_not_found",
                retryable=False,
                extra={"candidate_node_titles": candidate_titles[:4]},
            )
        return await _rewrite_local_subtree(
            current_content=current_content,
            message=instruction,
            config=config,
            project_id=project_id,
            rag_source_ids=rag_source_ids,
            started_at=started_at,
            target_node_id=target_node_id,
            target_node_title=target_node_title,
        )

    return await _rewrite_full_map(
        current_content=current_content,
        message=instruction,
        config=config,
        project_id=project_id,
        rag_source_ids=rag_source_ids,
        started_at=started_at,
    )
