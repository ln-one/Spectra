"""Word document structured refine."""

from __future__ import annotations

import copy
import json
import os
import re
from typing import Any

from services.ai import ai_service
from services.ai.model_router import ModelRouteTask
from utils.exceptions import APIException, ErrorCode

from .common import _load_rag_snippets
from ..word_document_content import (
    document_content_to_html,
    document_content_to_markdown,
    markdown_to_document_content,
    normalize_document_content,
)


def _env_positive_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
        return value if value > 0 else default
    except ValueError:
        return default


def _clean_markdown_output(text: str) -> str:
    cleaned = str(text or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z0-9_-]*\n?", "", cleaned).strip()
        cleaned = re.sub(r"\n?```$", "", cleaned).strip()
    return cleaned


def _normalize_for_compare(text: str) -> str:
    return re.sub(r"\s+", "", str(text or ""))


def _html_to_markdown_like_text(value: str) -> str:
    raw = str(value or "")
    if not raw.strip():
        return ""
    text = re.sub(r"(?i)<br\\s*/?>", "\n", raw)
    text = re.sub(r"(?i)</p>", "\n\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = (
        text.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
    )
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _is_generic_word_title(value: str) -> bool:
    normalized = str(value or "").strip()
    if not normalized:
        return True
    lowered = normalized.lower()
    return bool(
        re.match(r"^第\s*\d+\s*次讲义文档(?:[。.!！])?$", normalized, flags=re.IGNORECASE)
        or lowered in {
            "教案",
            "教学教案",
            "教学文档",
            "讲义文档",
            "未命名教案",
            "word 生成记录",
            "word生成记录",
            "教学文档工作台",
            "教学文档（生成中）",
            "教学文档 - 生成中",
            "教学文档",
            "教学教案",
        }
    )


def _resolve_existing_markdown(
    *,
    current_content: dict[str, Any],
    config: dict[str, Any],
) -> str:
    markdown_candidates = [
        config.get("markdown_content"),
        config.get("lesson_plan_markdown"),
        current_content.get("lesson_plan_markdown"),
        current_content.get("markdown_content"),
        current_content.get("content"),
        current_content.get("body"),
        current_content.get("text"),
    ]
    for candidate in markdown_candidates:
        resolved = str(candidate or "").strip()
        if resolved:
            return resolved
    current_doc = current_content.get("document_content")
    if isinstance(current_doc, dict):
        resolved = document_content_to_markdown(current_doc).strip()
        if resolved:
            return resolved
    preview_html = _html_to_markdown_like_text(
        str(
            current_content.get("preview_html")
            or current_content.get("doc_source_html")
            or ""
        )
    )
    if preview_html:
        return preview_html
    return ""


async def _rewrite_markdown_with_instruction(
    *,
    base_markdown: str,
    message: str,
    project_id: str,
    rag_source_ids: list[str] | None,
) -> str:
    rag_snippets = await _load_rag_snippets(
        project_id=project_id,
        query=message,
        rag_source_ids=rag_source_ids,
    )
    prompt = (
        "你是教学文档编辑助手。请根据“修改要求”直接改写当前 Markdown 教案。\n"
        "只输出改写后的完整 Markdown，不要解释，不要代码块围栏。\n"
        "保持原主题与章节结构，优先提升教学可执行性与可读层级。\n"
        "要求：\n"
        "- 保留并强化 # / ## / ### 层级。\n"
        "- 适度使用 - 和 1. 列表。\n"
        "- 删除噪声字段、异常符号和无意义片段。\n"
        f"修改要求：{message}\n"
        f"参考片段：{json.dumps(rag_snippets, ensure_ascii=False)}\n"
        "当前 Markdown：\n"
        f"{base_markdown}\n"
    )
    model = str(os.getenv("STUDIO_WORD_REFINE_MODEL", "") or "").strip() or None
    max_tokens = _env_positive_int("STUDIO_WORD_REFINE_MAX_TOKENS", 3200)
    result = await ai_service.generate(
        prompt=prompt,
        model=model,
        route_task=ModelRouteTask.LESSON_PLAN_REASONING,
        has_rag_context=bool(rag_snippets),
        max_tokens=max_tokens,
    )
    rewritten_markdown = _clean_markdown_output(str(result.get("content") or ""))
    if _normalize_for_compare(rewritten_markdown) == _normalize_for_compare(base_markdown):
        retry_prompt = (
            prompt
            + "\n注意：你上一次改写与原文几乎一致。请严格执行修改要求，至少做 3 处可见改动。"
        )
        retry_result = await ai_service.generate(
            prompt=retry_prompt,
            model=model,
            route_task=ModelRouteTask.LESSON_PLAN_REASONING,
            has_rag_context=bool(rag_snippets),
            max_tokens=max_tokens,
        )
        rewritten_markdown = _clean_markdown_output(
            str(retry_result.get("content") or "")
        )
    if not rewritten_markdown:
        raise APIException(
            status_code=502,
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            message="Word 文档微调返回为空，请重试。",
        )
    return rewritten_markdown


async def refine_word_document_content(
    *,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any],
    project_id: str,
    rag_source_ids: list[str] | None,
) -> dict[str, Any]:
    updated = copy.deepcopy(current_content)
    raw_document = config.get("document_content")
    if isinstance(raw_document, dict):
        document_content = normalize_document_content(raw_document)
    else:
        instruction = str(message or "").strip()
        base_markdown = _resolve_existing_markdown(
            current_content=current_content,
            config=config,
        )
        if not instruction:
            raise APIException(
                status_code=400,
                error_code=ErrorCode.INVALID_INPUT,
                message="word_document structured refine requires message or document_content",
            )
        if not base_markdown:
            raise APIException(
                status_code=400,
                error_code=ErrorCode.INVALID_INPUT,
                message="当前文档缺少可编辑正文，无法执行聊天微调",
            )
        rewritten_markdown = await _rewrite_markdown_with_instruction(
            base_markdown=base_markdown,
            message=instruction,
            project_id=project_id,
            rag_source_ids=rag_source_ids,
        )
        document_content = normalize_document_content(
            markdown_to_document_content(rewritten_markdown)
        )
    if not isinstance(document_content, dict):
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="word_document structured refine requires document_content",
        )
    requested_title = str(config.get("document_title") or "").strip()
    current_title = str(
        updated.get("title") or current_content.get("title") or ""
    ).strip()
    if requested_title and not _is_generic_word_title(requested_title):
        title = requested_title
    elif current_title:
        title = current_title
    else:
        title = "教学文档"
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
