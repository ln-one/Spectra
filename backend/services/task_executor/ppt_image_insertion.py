"""PPT image insertion helpers for generation runtime."""

from __future__ import annotations

import logging

from services.courseware_ai.parsing import (
    extract_frontmatter,
    parse_marp_slides,
    reassemble_marp,
)
from services.database.prisma_compat import find_many_with_select_fallback

logger = logging.getLogger(__name__)

_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

_PRIORITY_IMAGE_PAGES = {
    "process",
    "structure",
    "experiment",
    "comparison",
    "procedure",
    "mechanism",
    "workflow",
    "diagram",
    "illustration",
}

_SKIP_IMAGE_PAGES = {"definition", "conclusion", "summary", "abstract", "title"}


def _is_image_filename(filename: str | None) -> bool:
    if not filename:
        return False
    lower = filename.strip().lower()
    return any(lower.endswith(ext) for ext in _IMAGE_EXTENSIONS)


def _classify_page_semantic(title: str, content: str) -> tuple[str, dict]:
    """分类页面语义类型并返回评分"""
    text = f"{title} {content}".lower()
    scores = {
        "page_semantic_fit": 0.0,
        "keyword_coverage": 0.0,
        "teaching_dependency": 0.0,
        "layout_capacity": 0.0,
    }

    priority_match = sum(1 for kw in _PRIORITY_IMAGE_PAGES if kw in text)
    skip_match = sum(1 for kw in _SKIP_IMAGE_PAGES if kw in text)

    if priority_match > 0:
        scores["page_semantic_fit"] = min(1.0, priority_match * 0.3)
        scores["teaching_dependency"] = 0.7
        semantic_type = "priority"
    elif skip_match > 0:
        scores["page_semantic_fit"] = 0.0
        semantic_type = "skip"
    else:
        scores["page_semantic_fit"] = 0.3
        semantic_type = "neutral"

    return semantic_type, scores


def _assess_layout_risk(content: str, scores: dict) -> str:
    """评估版式风险"""
    lines = [
        line_text.strip()
        for line_text in content.split("\n")
        if line_text.strip() and not line_text.strip().startswith("#")
    ]
    text_density = len(lines)

    if text_density > 8:
        scores["layout_capacity"] = 0.0
        return "high"
    elif text_density > 5:
        scores["layout_capacity"] = 0.5
        return "medium"

    scores["layout_capacity"] = 1.0
    return "low"


def _extract_rag_image_upload_ids(rag_context: list[dict] | None) -> list[str]:
    image_upload_ids: list[str] = []
    for hit in rag_context or []:
        if not isinstance(hit, dict):
            continue
        metadata = hit.get("metadata")
        if not isinstance(metadata, dict):
            continue
        upload_id = str(metadata.get("upload_id") or "").strip()
        if not upload_id:
            continue
        source_type = str(metadata.get("source_type") or "").strip().lower()
        filename = str(metadata.get("filename") or "").strip()
        if source_type == "image" or _is_image_filename(filename):
            if upload_id not in image_upload_ids:
                image_upload_ids.append(upload_id)
    return image_upload_ids


def _inject_image_blocks(
    markdown_content: str,
    image_uploads: list[dict[str, str]],
) -> tuple[str, list[dict]]:
    """注入图片块并返回元数据"""
    if not markdown_content.strip() or not image_uploads:
        return markdown_content, []

    frontmatter = extract_frontmatter(markdown_content)
    slides = parse_marp_slides(markdown_content)
    if not slides:
        return markdown_content, []

    candidate_indices = list(range(len(slides)))
    if len(slides) >= 3:
        candidate_indices = list(range(1, len(slides) - 1))
    if not candidate_indices:
        candidate_indices = [0]

    patched_contents: list[str] = [str(slide.get("content") or "") for slide in slides]
    metadata_list: list[dict] = []
    target_pointer = 0

    for image_upload in image_uploads:
        if target_pointer >= len(candidate_indices):
            break
        target_index = candidate_indices[target_pointer]
        current_content = patched_contents[target_index].strip()

        if "![" in current_content:
            target_pointer += 1
            continue

        title = str(slides[target_index].get("title") or "")
        semantic_type, scores = _classify_page_semantic(title, current_content)
        layout_risk = _assess_layout_risk(current_content, scores)

        if semantic_type == "skip" or layout_risk == "high":
            metadata_list.append(
                {
                    "slide_index": target_index,
                    "image_insertion_decision": "skip",
                    "page_semantic_type": semantic_type,
                    "layout_risk_level": layout_risk,
                    "skip_reason": f"semantic={semantic_type}, risk={layout_risk}",
                    "scores": scores,
                }
            )
            target_pointer += 1
            continue

        filepath = str(image_upload.get("filepath") or "").strip()
        if not filepath:
            target_pointer += 1
            continue

        filepath = filepath.replace("\\", "/")
        filename = str(image_upload.get("filename") or "图片素材").strip()

        scores["keyword_coverage"] = 0.6

        patched_contents[target_index] = (
            f"{current_content}\n\n"
            f"![w:520](<{filepath}>)\n\n"
            f"> 配图来源：{filename}"
        ).strip()

        metadata_list.append(
            {
                "slide_index": target_index,
                "image_insertion_decision": "insert",
                "page_semantic_type": semantic_type,
                "layout_risk_level": layout_risk,
                "image_count": 1,
                "image_slot": "bottom_panel",
                "image_match_reason": f"RAG matched: {filename}",
                "scores": scores,
            }
        )
        target_pointer += 1

    return reassemble_marp(frontmatter, patched_contents), metadata_list


async def inject_rag_images_into_courseware_content(
    *,
    db_service,
    project_id: str,
    query: str,
    session_id: str | None,
    rag_source_ids: list[str] | None,
    courseware_content,
    max_images: int = 2,
) -> dict | None:
    """注入RAG图片并返回插图决策元数据"""
    from services.ai import ai_service

    retrieval_mode = "strict_sources" if rag_source_ids else "default_library"
    filters = {"file_ids": rag_source_ids} if rag_source_ids else None

    try:
        rag_context = await ai_service._retrieve_rag_context(
            project_id=project_id,
            query=query,
            top_k=8,
            score_threshold=0.25,
            session_id=session_id,
            filters=filters,
        )
    except Exception as exc:
        logger.warning("skip ppt image insertion, rag query failed: %s", exc)
        return None

    image_upload_ids = _extract_rag_image_upload_ids(rag_context)
    if not image_upload_ids:
        return {
            "retrieval_mode": retrieval_mode,
            "image_count": 0,
            "skip_reason": "no_rag_images",
        }

    upload_rows = await find_many_with_select_fallback(
        model=db_service.db.upload,
        where={
            "projectId": project_id,
            "id": {"in": image_upload_ids},
            "fileType": "image",
            "status": "ready",
        },
        select={"id": True, "filename": True, "filepath": True},
    )
    if not upload_rows:
        return {
            "retrieval_mode": retrieval_mode,
            "image_count": 0,
            "skip_reason": "no_ready_uploads",
        }

    upload_by_id: dict[str, dict[str, str]] = {}
    for row in upload_rows:
        row_id = str(
            row.get("id") if isinstance(row, dict) else getattr(row, "id", "") or ""
        ).strip()
        if not row_id:
            continue
        filename = str(
            row.get("filename")
            if isinstance(row, dict)
            else getattr(row, "filename", "") or ""
        ).strip()
        filepath = str(
            row.get("filepath")
            if isinstance(row, dict)
            else getattr(row, "filepath", "") or ""
        ).strip()
        if not filepath:
            continue
        upload_by_id[row_id] = {
            "filename": filename or "图片素材",
            "filepath": filepath,
        }

    ordered_uploads: list[dict[str, str]] = []
    for upload_id in image_upload_ids:
        matched = upload_by_id.get(upload_id)
        if matched:
            ordered_uploads.append(matched)
        if len(ordered_uploads) >= max(1, max_images):
            break
    if not ordered_uploads:
        return {
            "retrieval_mode": retrieval_mode,
            "image_count": 0,
            "skip_reason": "no_matched_uploads",
        }

    markdown_content = str(getattr(courseware_content, "markdown_content", "") or "")
    updated_markdown, metadata_list = _inject_image_blocks(
        markdown_content, ordered_uploads
    )

    if updated_markdown != markdown_content:
        setattr(courseware_content, "markdown_content", updated_markdown)
        render_markdown = str(getattr(courseware_content, "render_markdown", "") or "")
        if render_markdown.strip():
            updated_render_markdown, _ = _inject_image_blocks(
                render_markdown, ordered_uploads
            )
            if updated_render_markdown != render_markdown:
                setattr(courseware_content, "render_markdown", updated_render_markdown)

    return {
        "retrieval_mode": retrieval_mode,
        "image_count": len(
            [m for m in metadata_list if m.get("image_insertion_decision") == "insert"]
        ),
        "slides_metadata": metadata_list,
    }
