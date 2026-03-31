from __future__ import annotations

from typing import Any

from services.database import db_service


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return "".join(str(value).lower().split())


def _unique_keep_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        output.append(value)
    return output


def _resolve_case_chunk_ids(
    case: dict[str, Any],
    parsed_chunks: list[dict[str, Any]],
) -> list[str]:
    chunk_id_field = case["_chunk_id_field"]
    source_contains_field = case["_source_contains_field"]
    keyword_field = case.get("_keyword_field", "expected_keywords")
    min_keyword_hits_field = case.get("_min_keyword_hits_field", "min_keyword_hits")

    existing = [
        chunk_id
        for chunk_id in case.get(chunk_id_field, [])
        if isinstance(chunk_id, str) and chunk_id
    ]
    if existing:
        return _unique_keep_order(existing)

    normalized_snippets = [
        _normalize_text(item)
        for item in case.get(source_contains_field, [])
        if isinstance(item, str) and item.strip()
    ]
    if normalized_snippets:
        matched = [
            chunk["id"]
            for chunk in parsed_chunks
            if any(
                snippet and snippet in chunk["normalized_content"]
                for snippet in normalized_snippets
            )
        ]
        if matched:
            return _unique_keep_order(matched)

    keywords = [
        _normalize_text(item)
        for item in case.get(keyword_field, [])
        if isinstance(item, str) and item.strip()
    ]
    if not keywords:
        return []

    min_keyword_hits = case.get(min_keyword_hits_field)
    if not isinstance(min_keyword_hits, int) or min_keyword_hits <= 0:
        min_keyword_hits = 2 if len(keywords) >= 3 else 1

    scored: list[tuple[int, str]] = []
    for chunk in parsed_chunks:
        hits = sum(
            1
            for keyword in keywords
            if keyword and keyword in chunk["normalized_content"]
        )
        if hits >= min_keyword_hits:
            scored.append((hits, chunk["id"]))

    scored.sort(key=lambda item: (-item[0], item[1]))
    return _unique_keep_order([chunk_id for _, chunk_id in scored])


def resolve_case_relevant_chunk_ids(
    case: dict[str, Any],
    parsed_chunks: list[dict[str, Any]],
) -> list[str]:
    proxy_case = dict(case)
    proxy_case["_chunk_id_field"] = "relevant_chunk_ids"
    proxy_case["_source_contains_field"] = "relevant_source_contains"
    return _resolve_case_chunk_ids(proxy_case, parsed_chunks)


def resolve_case_usable_chunk_ids(
    case: dict[str, Any],
    parsed_chunks: list[dict[str, Any]],
) -> list[str]:
    existing = [
        chunk_id
        for chunk_id in case.get("usable_chunk_ids", [])
        if isinstance(chunk_id, str) and chunk_id
    ]
    if existing:
        return _unique_keep_order(existing)

    proxy_case = dict(case)
    proxy_case["_chunk_id_field"] = "usable_chunk_ids"
    proxy_case["_source_contains_field"] = "usable_source_contains"
    resolved = _resolve_case_chunk_ids(proxy_case, parsed_chunks)
    if resolved:
        return resolved

    fallback_relevant = [
        chunk_id
        for chunk_id in case.get("relevant_chunk_ids", [])
        if isinstance(chunk_id, str) and chunk_id
    ]
    return _unique_keep_order(fallback_relevant)


async def load_project_parsed_chunks(project_id: str) -> list[dict[str, Any]]:
    connected_here = False
    try:
        await db_service.connect()
        connected_here = True
    except Exception:
        # 连接失败时直接降级，不阻断整场评测。
        return []

    try:
        total_files = await db_service.count_project_files(project_id)
        if total_files <= 0:
            return []

        uploads = await db_service.get_project_files(
            project_id=project_id, page=1, limit=total_files
        )
        upload_ids = [upload.id for upload in uploads if getattr(upload, "id", None)]
        if not upload_ids:
            return []

        parsed_chunks = await db_service.db.parsedchunk.find_many(
            where={"uploadId": {"in": upload_ids}}
        )
        return [
            {
                "id": chunk.id,
                "content": chunk.content or "",
                "normalized_content": _normalize_text(chunk.content or ""),
                "upload_id": chunk.uploadId,
            }
            for chunk in parsed_chunks
        ]
    finally:
        if connected_here:
            try:
                await db_service.disconnect()
            except Exception:
                pass


async def resolve_dataset_relevant_chunk_ids(
    project_id: str,
    cases: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    parsed_chunks = await load_project_parsed_chunks(project_id)
    if not parsed_chunks:
        return cases, {
            "resolved_case_count": 0,
            "resolved_chunk_count": 0,
            "resolved_usable_case_count": 0,
            "resolved_usable_chunk_count": 0,
        }

    resolved_case_count = 0
    resolved_chunk_count = 0
    resolved_usable_case_count = 0
    resolved_usable_chunk_count = 0
    for case in cases:
        resolved = resolve_case_relevant_chunk_ids(case, parsed_chunks)
        if resolved and not case.get("relevant_chunk_ids"):
            case["relevant_chunk_ids"] = resolved
            resolved_case_count += 1
            resolved_chunk_count += len(resolved)

        usable_resolved = resolve_case_usable_chunk_ids(case, parsed_chunks)
        if usable_resolved and not case.get("usable_chunk_ids"):
            case["usable_chunk_ids"] = usable_resolved
            resolved_usable_case_count += 1
            resolved_usable_chunk_count += len(usable_resolved)

    return cases, {
        "resolved_case_count": resolved_case_count,
        "resolved_chunk_count": resolved_chunk_count,
        "resolved_usable_case_count": resolved_usable_case_count,
        "resolved_usable_chunk_count": resolved_usable_chunk_count,
    }
