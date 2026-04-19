"""Word document structured refine."""

from __future__ import annotations

import copy
from typing import Any

from utils.exceptions import APIException, ErrorCode

from ..word_document_content import (
    document_content_to_html,
    document_content_to_markdown,
    normalize_document_content,
)


async def refine_word_document_content(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
    project_id: str,
    rag_source_ids: list[str] | None,
) -> dict[str, Any]:
    del project_id, rag_source_ids
    updated = copy.deepcopy(current_content)
    raw_document = config.get("document_content")
    if not isinstance(raw_document, dict):
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="word_document structured refine requires document_content",
        )
    document_content = normalize_document_content(raw_document)
    title = str(config.get("document_title") or updated.get("title") or "").strip() or "教学文档"
    summary = str(config.get("document_summary") or updated.get("summary") or message or "").strip()
    if not summary:
        summary = "已更新文档内容。"

    updated["kind"] = "teaching_document"
    updated["legacy_kind"] = "word_document"
    updated["schema_id"] = updated.get("schema_id") or "lesson_plan_v1"
    updated["schema_version"] = updated.get("schema_version") or 1
    updated["preset"] = updated.get("preset") or "lesson_plan"
    updated["title"] = title
    updated["summary"] = summary
    updated["document_content"] = document_content
    updated["lesson_plan_markdown"] = document_content_to_markdown(document_content)
    updated["preview_html"] = document_content_to_html(
        document_content,
        title=title,
        summary=summary,
    )
    updated["doc_source_html"] = updated["preview_html"]
    return updated
