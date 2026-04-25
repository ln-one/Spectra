from __future__ import annotations

import json
import re
from collections import Counter, defaultdict, deque
from typing import Any

MAX_MINDMAP_TITLE_LENGTH = 32
MAX_NODE_TITLE_LENGTH = 24
MAX_NODE_SUMMARY_LENGTH = 140

_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_SPACE_RE = re.compile(r"\s+")
_SOURCE_PREFIX_RE = re.compile(r"^\s*\[来源:[^\]]+\]\s*", flags=re.IGNORECASE)
_NOISE_TOKEN_RE = re.compile(
    r"(?:\bchunk\b|\bpage\b|\bfile\b|\bjson\b|\bschema\b|\bstandard\b|"
    r"资料里提到|资料显示|原文提到|见第?\s*\d+\s*页|来源[:：])",
    flags=re.IGNORECASE,
)
_FILE_TOKEN_RE = re.compile(
    r"\b[\w\-]+\.(?:pdf|pptx?|docx?|txt|md|xlsx?)\b",
    flags=re.IGNORECASE,
)
_LEADING_BULLET_RE = re.compile(r"^\s*(?:[-*•]+|\d+[.)、]|[一二三四五六七八九十]+[、.])\s*")
_TRAILING_PUNC_RE = re.compile(r"[，。；：、,.;:!?！？\-\s]+$")
_PAREN_SOURCE_RE = re.compile(
    r"[（(](?:来源|第?\s*\d+\s*页|chunk|file|资料)[^）)]*[）)]",
    flags=re.IGNORECASE,
)
_EMPTY_PAREN_RE = re.compile(r"[（(]\s*[）)]")
_GENERIC_TITLES = {
    "知识点",
    "内容",
    "资料",
    "节点",
    "分支",
    "更多内容",
    "展开说明",
}


def _normalize_text(value: Any) -> str:
    text = str(value or "")
    text = _CONTROL_RE.sub("", text)
    text = text.replace("\r\n", " ").replace("\r", " ").replace("\n", " ")
    text = _SPACE_RE.sub(" ", text).strip()
    return text


def _trim_text(text: str, limit: int) -> str:
    candidate = text.strip()
    if len(candidate) <= limit:
        return candidate
    return candidate[: limit - 1].rstrip(" ，。；：、,.;:!?！？-") + "…"


def _clean_title(value: Any, *, limit: int) -> str:
    text = _normalize_text(value)
    text = _SOURCE_PREFIX_RE.sub("", text)
    text = _LEADING_BULLET_RE.sub("", text)
    text = _PAREN_SOURCE_RE.sub("", text)
    text = _EMPTY_PAREN_RE.sub("", text)
    text = _FILE_TOKEN_RE.sub("", text)
    text = _NOISE_TOKEN_RE.sub("", text)
    text = _EMPTY_PAREN_RE.sub("", text)
    text = _TRAILING_PUNC_RE.sub("", text).strip()
    text = _SPACE_RE.sub(" ", text)
    return _trim_text(text, limit)


def _clean_summary(value: Any) -> str:
    text = _normalize_text(value)
    text = _SOURCE_PREFIX_RE.sub("", text)
    text = _PAREN_SOURCE_RE.sub("", text)
    text = _EMPTY_PAREN_RE.sub("", text)
    text = _FILE_TOKEN_RE.sub("", text)
    text = _NOISE_TOKEN_RE.sub("", text)
    text = _EMPTY_PAREN_RE.sub("", text)
    text = _SPACE_RE.sub(" ", text).strip(" ，。；：、,.;:!?！？-")
    return _trim_text(text, MAX_NODE_SUMMARY_LENGTH)


def sanitize_mindmap_title(value: Any) -> str:
    return _clean_title(value, limit=MAX_MINDMAP_TITLE_LENGTH)


def _is_noise_node(title: str, summary: str) -> bool:
    if not title:
        return True
    if title in _GENERIC_TITLES and not summary:
        return True
    if len(title) <= 1 and not summary:
        return True
    return False


def _normalize_id(value: Any, index: int) -> str:
    raw = re.sub(r"[^\w\-]+", "-", str(value or "").strip()).strip("-").lower()
    if not raw:
        return f"node-{index}"
    return raw[:48]


def _iter_raw_nodes(
    raw_nodes: list[Any], parent_id: str | None = None
) -> list[dict[str, Any]]:
    collected: list[dict[str, Any]] = []
    for item in raw_nodes:
        if not isinstance(item, dict):
            continue
        row = dict(item)
        row_parent = row.get("parent_id")
        effective_parent = (
            str(row_parent).strip()
            if row_parent not in (None, "", "None")
            else (parent_id or None)
        )
        row["parent_id"] = effective_parent
        collected.append(row)
        children = row.get("children")
        if isinstance(children, list) and children:
            collected.extend(_iter_raw_nodes(children, str(row.get("id") or "").strip() or None))
    return collected


def _root_title_from_payload(payload: dict[str, Any]) -> str:
    return (
        sanitize_mindmap_title(payload.get("title"))
        or sanitize_mindmap_title(payload.get("topic"))
        or "知识导图"
    )


def normalize_knowledge_mindmap_payload(
    payload: dict[str, Any],
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    del config
    raw_nodes = payload.get("nodes")
    if not isinstance(raw_nodes, list):
        raw_nodes = []

    flattened = _iter_raw_nodes(raw_nodes)
    normalized_nodes: list[dict[str, Any]] = []
    used_ids: set[str] = set()
    duplicate_guard: set[tuple[str | None, str]] = set()

    for index, row in enumerate(flattened, start=1):
        title = _clean_title(row.get("title") or row.get("label"), limit=MAX_NODE_TITLE_LENGTH)
        summary = _clean_summary(row.get("summary"))
        if _is_noise_node(title, summary):
            continue
        node_id = _normalize_id(row.get("id"), index)
        base_id = node_id
        suffix = 2
        while node_id in used_ids:
            node_id = f"{base_id}-{suffix}"
            suffix += 1
        used_ids.add(node_id)
        parent_id = str(row.get("parent_id") or "").strip() or None
        duplicate_key = (parent_id, title.lower())
        if duplicate_key in duplicate_guard:
            continue
        duplicate_guard.add(duplicate_key)
        node = {
            "id": node_id,
            "parent_id": parent_id,
            "title": title,
        }
        if summary:
            node["summary"] = summary
        normalized_nodes.append(node)

    title = _root_title_from_payload(payload)
    if not normalized_nodes:
        return {
            "kind": "mindmap",
            "title": title,
            "summary": "",
            "nodes": [
                {
                    "id": "root",
                    "parent_id": None,
                    "title": title,
                }
            ],
        }

    ids = {str(node["id"]) for node in normalized_nodes}
    root_candidates = [
        node for node in normalized_nodes if not node.get("parent_id") or node.get("parent_id") not in ids
    ]

    root_id = "root"
    if len(root_candidates) == 1:
        root_candidate = root_candidates[0]
        root_candidate["parent_id"] = None
        root_title = _clean_title(root_candidate.get("title"), limit=MAX_NODE_TITLE_LENGTH) or title
        root_candidate["title"] = root_title
        root_id = str(root_candidate["id"])
        title = sanitize_mindmap_title(payload.get("title")) or root_title
    else:
        root_node = {"id": root_id, "parent_id": None, "title": title}
        normalized_nodes = [node for node in normalized_nodes if str(node.get("id")) != root_id]
        for node in normalized_nodes:
            if not node.get("parent_id") or node.get("parent_id") not in ids:
                node["parent_id"] = root_id
        normalized_nodes.insert(0, root_node)

    node_by_id = {str(node["id"]): node for node in normalized_nodes}
    for node in normalized_nodes:
        parent_id = node.get("parent_id")
        if parent_id and parent_id not in node_by_id:
            node["parent_id"] = root_id
        if str(node["id"]) == root_id:
            node["parent_id"] = None

    summary = _clean_summary(payload.get("summary"))
    normalized = {
        "kind": "mindmap",
        "title": title,
        "nodes": normalized_nodes,
    }
    if summary:
        normalized["summary"] = summary
    return normalized


def build_mindmap_schema_hint(_config: dict[str, Any] | None = None) -> str:
    example = {
        "title": "主题名称，聚焦一个核心问题",
        "summary": "整张导图的归纳性说明，不带来源痕迹。",
        "nodes": [
            {
                "id": "root",
                "parent_id": None,
                "title": "核心主题",
                "summary": "根主题只表达一个问题。",
                "children": [
                    {
                        "id": "branch-1",
                        "parent_id": "root",
                        "title": "一级分支短词",
                        "summary": "一级分支使用分类或关系视角。",
                        "children": [
                            {
                                "id": "branch-1-child-1",
                                "parent_id": "branch-1",
                                "title": "二级分支短词",
                                "summary": "摘要必须是归纳表达，不得照抄 RAG。",
                            }
                        ],
                    }
                ],
            }
        ],
    }
    return json.dumps(example, ensure_ascii=False)


def evaluate_mindmap_payload_quality(payload: dict[str, Any]) -> tuple[int, list[str], dict[str, int]]:
    nodes = [dict(node) for node in (payload.get("nodes") or []) if isinstance(node, dict)]
    if not nodes:
        return 0, ["nodes_empty"], {"node_count": 0, "primary_branch_count": 0, "max_depth": 0}

    root = next(
        (node for node in nodes if node.get("parent_id") in {None, "", "None"}),
        nodes[0],
    )
    root_id = str(root.get("id") or "")
    children_map: dict[str, list[str]] = defaultdict(list)
    titles: list[str] = []
    noise_hits = 0
    duplicate_counter: Counter[str] = Counter()

    for node in nodes:
        node_id = str(node.get("id") or "")
        parent_id = str(node.get("parent_id") or "").strip()
        title = _normalize_text(node.get("title"))
        summary = _normalize_text(node.get("summary"))
        if parent_id:
            children_map[parent_id].append(node_id)
        if title:
            titles.append(title)
            duplicate_counter[title.lower()] += 1
        if _NOISE_TOKEN_RE.search(title) or _NOISE_TOKEN_RE.search(summary):
            noise_hits += 1
        if _FILE_TOKEN_RE.search(title) or _FILE_TOKEN_RE.search(summary):
            noise_hits += 1

    visited = {root_id}
    queue = deque([(root_id, 1)])
    max_depth = 1
    while queue:
        current, depth = queue.popleft()
        max_depth = max(max_depth, depth)
        for child in children_map.get(current, []):
            if child in visited:
                continue
            visited.add(child)
            queue.append((child, depth + 1))

    internal_nodes = 0
    single_child_internal_nodes = 0
    for node_id, children in children_map.items():
        if node_id not in visited:
            continue
        if children:
            internal_nodes += 1
        if len(children) == 1:
            single_child_internal_nodes += 1

    primary_branch_count = len(children_map.get(root_id, []))
    avg_title_length = int(sum(len(title) for title in titles) / max(len(titles), 1))
    duplicate_title_count = sum(1 for count in duplicate_counter.values() if count > 1)
    thin_chain_ratio = int((single_child_internal_nodes / max(internal_nodes, 1)) * 100)
    deep_branch_count = 0
    uneven_branching_bonus = 0
    depth_map: dict[str, int] = {root_id: 1}
    queue = deque([root_id])
    while queue:
        current = queue.popleft()
        depth = depth_map.get(current, 1)
        children = children_map.get(current, [])
        if depth >= 3 and len(children) >= 2:
            deep_branch_count += 1
        if depth == 2 and len(children) >= 3:
            uneven_branching_bonus += 1
        for child in children:
            if child in depth_map:
                continue
            depth_map[child] = depth + 1
            queue.append(child)
    metrics = {
        "node_count": len(nodes),
        "primary_branch_count": primary_branch_count,
        "max_depth": max_depth,
        "avg_title_length": avg_title_length,
        "noise_hits": noise_hits,
        "duplicate_title_count": duplicate_title_count,
        "thin_chain_ratio": thin_chain_ratio,
        "deep_branch_count": deep_branch_count,
        "uneven_branching_bonus": uneven_branching_bonus,
    }

    issues: list[str] = []
    score = 100
    if primary_branch_count < 3:
        issues.append("insufficient_primary_branches")
        score -= 14
    if len(nodes) < 12:
        issues.append("mindmap_too_small")
        score -= 16
    if max_depth < 3:
        issues.append("insufficient_depth")
        score -= 18
    if avg_title_length > 24:
        issues.append("titles_too_verbose")
        score -= 10
    if noise_hits > 0:
        issues.append("contains_rag_noise")
        score -= 18
    if duplicate_title_count > 1:
        issues.append("repeated_titles")
        score -= 10
    if thin_chain_ratio > 85 and max_depth < 5:
        issues.append("thin_chain_structure")
        score -= 6
    if max_depth >= 4 and deep_branch_count == 0:
        issues.append("missing_deep_branching")
        score -= 6
    if uneven_branching_bonus > 0:
        score += min(4, uneven_branching_bonus * 2)
    return max(0, min(100, score)), issues, metrics
