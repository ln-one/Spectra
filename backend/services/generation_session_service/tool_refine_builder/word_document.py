"""Word document structured refine."""

from __future__ import annotations

import copy
import logging
import os
import re
from typing import Any, Literal

from services.ai import ai_service
from services.ai.model_router import ModelRouteTask
from utils.exceptions import APIException, ErrorCode

from .common import _load_rag_snippets
from .word_document_markdown_quality import (
    _build_refine_prompt,
    _build_repair_prompt,
    _collect_markdown_quality_issues,
    _count_valid_markdown_tables,
    _extract_markdown_title,
    _finalize_refined_markdown,
)
from ..card_execution_runtime_word import compose_word_title, is_placeholder_word_title
from ..word_document_content import (
    document_content_to_markdown,
    lesson_plan_markdown_to_html,
    markdown_to_document_content,
    normalize_document_content,
)

logger = logging.getLogger(__name__)


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
    return is_placeholder_word_title(value) or bool(
        re.match(
            r"^第\s*\d+\s*次讲义文档(?:[。.!！])?$", normalized, flags=re.IGNORECASE
        )
    ) or lowered in {
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
    }


def _resolve_refine_max_tokens() -> int:
    from ..tool_content_builder_generation import _resolve_card_generation_max_tokens

    generation_floor = _resolve_card_generation_max_tokens("word_document")
    explicit_refine_limit = _env_positive_int(
        "STUDIO_WORD_REFINE_MAX_TOKENS",
        generation_floor,
    )
    return max(generation_floor, explicit_refine_limit)


def _resolve_source_title(current_content: dict[str, Any], config: dict[str, Any]) -> str:
    source_snapshot = current_content.get("source_snapshot")
    if isinstance(source_snapshot, dict):
        primary_source_title = str(
            source_snapshot.get("primary_source_title") or ""
        ).strip()
        if primary_source_title:
            return primary_source_title
    return str(config.get("source_title") or current_content.get("source_title") or "").strip()


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


def _resolve_word_refine_mode(config: dict[str, Any]) -> Literal["direct_edit", "chat_refine"]:
    if config.get("direct_edit") is True:
        return "direct_edit"
    if str(config.get("operation") or "").strip().lower() == "direct_edit":
        return "direct_edit"
    raw_document = config.get("document_content")
    if isinstance(raw_document, dict) and raw_document:
        return "direct_edit"
    if str(config.get("lesson_plan_markdown") or "").strip():
        return "direct_edit"
    if str(config.get("markdown_content") or "").strip():
        return "direct_edit"
    return "chat_refine"


def _resolve_chat_refine_model() -> str | None:
    for env_name in (
        "STUDIO_WORD_CHAT_REFINE_MODEL",
        "WORD_LESSON_PLAN_QUALITY_MODEL",
        "STUDIO_WORD_REFINE_MODEL",
    ):
        resolved = str(os.getenv(env_name, "") or "").strip()
        if resolved:
            return resolved
    return None


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
    prompt = _build_refine_prompt(
        base_markdown=base_markdown,
        message=message,
        rag_snippets=rag_snippets,
    )
    model = _resolve_chat_refine_model()
    max_tokens = _resolve_refine_max_tokens()
    result = await ai_service.generate(
        prompt=prompt,
        model=model,
        route_task=ModelRouteTask.LESSON_PLAN_REASONING,
        has_rag_context=bool(rag_snippets),
        max_tokens=max_tokens,
    )
    rewritten_markdown = _finalize_refined_markdown(
        base_markdown,
        _clean_markdown_output(str(result.get("content") or "")),
    )
    retry_required = _normalize_for_compare(rewritten_markdown) == _normalize_for_compare(
        base_markdown
    )
    quality_issues = _collect_markdown_quality_issues(
        base_markdown=base_markdown,
        candidate_markdown=rewritten_markdown,
    )
    if retry_required or quality_issues:
        retry_issues = list(quality_issues)
        if retry_required:
            retry_issues.append("insufficient_change")
        logger.warning(
            "word_document refine quality guard triggered: model=%s issues=%s",
            model or "default",
            retry_issues,
        )
        retry_prompt = _build_repair_prompt(
            base_markdown=base_markdown,
            candidate_markdown=rewritten_markdown,
            message=message,
            issues=retry_issues,
        )
        retry_result = await ai_service.generate(
            prompt=retry_prompt,
            model=model,
            route_task=ModelRouteTask.LESSON_PLAN_REASONING,
            has_rag_context=bool(rag_snippets),
            max_tokens=max_tokens,
        )
        rewritten_markdown = _finalize_refined_markdown(
            base_markdown,
            _clean_markdown_output(str(retry_result.get("content") or "")),
        )
        quality_issues = _collect_markdown_quality_issues(
            base_markdown=base_markdown,
            candidate_markdown=rewritten_markdown,
        )
    if not rewritten_markdown:
        raise APIException(
            status_code=502,
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            message="Word 文档微调返回为空，请重试。",
        )
    if quality_issues:
        logger.warning(
            "word_document refine rejected by quality guard: model=%s issues=%s",
            model or "default",
            quality_issues,
        )
        raise APIException(
            status_code=502,
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            message="教学文档微调结果结构退化，请重试。",
            details={
                "reason": "word_refine_quality_guard",
                "issues": quality_issues,
            },
        )
    logger.info(
        "word_document refine rewrite: model=%s max_tokens=%s base_markdown_length=%s output_length=%s base_tables=%s output_tables=%s retried=%s",
        model or "default",
        max_tokens,
        len(base_markdown),
        len(rewritten_markdown),
        _count_valid_markdown_tables(base_markdown),
        _count_valid_markdown_tables(rewritten_markdown),
        retry_required or bool(quality_issues),
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
    refine_mode = _resolve_word_refine_mode(config)
    raw_document = config.get("document_content")
    final_markdown = ""
    if refine_mode == "direct_edit":
        if isinstance(raw_document, dict) and raw_document:
            document_content = normalize_document_content(raw_document)
            final_markdown = document_content_to_markdown(document_content)
        else:
            direct_edit_markdown = str(
                config.get("lesson_plan_markdown") or config.get("markdown_content") or ""
            ).strip()
            if not direct_edit_markdown:
                raise APIException(
                    status_code=400,
                    error_code=ErrorCode.INVALID_INPUT,
                    message="word_document direct edit requires document_content or markdown content",
                )
            final_markdown = direct_edit_markdown
            document_content = normalize_document_content(markdown_to_document_content(final_markdown))
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
        final_markdown = rewritten_markdown
        document_content = markdown_to_document_content(final_markdown)
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
    markdown_title = _extract_markdown_title(
        str(config.get("lesson_plan_markdown") or "")
        or str(config.get("markdown_content") or "")
        or final_markdown
        or _resolve_existing_markdown(current_content=current_content, config=config)
    )
    source_title = _resolve_source_title(current_content, config)
    if requested_title and not _is_generic_word_title(requested_title):
        title = requested_title
    elif current_title and not _is_generic_word_title(current_title):
        title = current_title
    elif markdown_title and not _is_generic_word_title(markdown_title):
        title = compose_word_title(markdown_title)
    elif source_title:
        title = compose_word_title(source_title)
    else:
        title = "教学文档"
    summary = str(
        config.get("document_summary") or updated.get("summary") or message or ""
    ).strip()
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
    updated["lesson_plan_markdown"] = final_markdown or document_content_to_markdown(
        document_content
    )
    updated["markdown_content"] = updated["lesson_plan_markdown"]
    updated["preview_html"] = lesson_plan_markdown_to_html(
        updated["lesson_plan_markdown"],
        title=title,
        summary=summary,
    )
    updated["doc_source_html"] = updated["preview_html"]
    return updated
