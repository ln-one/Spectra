"""PPT image insertion helpers for generation runtime."""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Any

from services.courseware_ai.parsing import (
    extract_frontmatter,
    parse_marp_slides,
    reassemble_marp,
)
from services.database.prisma_compat import find_many_with_select_fallback

logger = logging.getLogger(__name__)

_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
_IMAGE_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*://")
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_GENERATED_ROOT = _BACKEND_ROOT / "generated"

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


def _to_generated_relative_path(path: Path) -> str:
    try:
        relative = os.path.relpath(str(path), str(_GENERATED_ROOT))
        return Path(relative).as_posix()
    except ValueError:
        # Windows may raise when drives differ; keep absolute fallback.
        return path.as_posix()


def _normalize_markdown_image_path(filepath: str, filename: str | None = None) -> str:
    raw = str(filepath or "").strip()
    if not raw:
        return ""

    normalized = raw.replace("\\", "/")
    lowered = normalized.lower()
    if lowered.startswith("data:image/") or _IMAGE_SCHEME_RE.match(normalized):
        return normalized

    if normalized.startswith("/app/"):
        absolute_candidate = Path(normalized)
        if absolute_candidate.exists():
            return _to_generated_relative_path(absolute_candidate)
        candidate = _BACKEND_ROOT / normalized[len("/app/") :]
        return _to_generated_relative_path(candidate)

    if normalized.startswith("./uploads/"):
        candidate = _BACKEND_ROOT / normalized[2:]
        return _to_generated_relative_path(candidate)

    if normalized.startswith("uploads/"):
        candidate = _BACKEND_ROOT / normalized
        return _to_generated_relative_path(candidate)

    if "/" not in normalized and _is_image_filename(filename or normalized):
        candidate = _BACKEND_ROOT / "uploads" / normalized
        return _to_generated_relative_path(candidate)

    path_obj = Path(normalized)
    if path_obj.is_absolute():
        return _to_generated_relative_path(path_obj)

    return _to_generated_relative_path(_BACKEND_ROOT / path_obj)


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


def _to_image_upload_candidate(
    row,
    *,
    required: bool,
    origin: str,
) -> tuple[str, dict[str, Any]] | None:
    row_id = str(
        row.get("id") if isinstance(row, dict) else getattr(row, "id", "") or ""
    ).strip()
    if not row_id:
        return None
    filename = str(
        row.get("filename") if isinstance(row, dict) else getattr(row, "filename", "")
    ).strip()
    filepath = str(
        row.get("filepath") if isinstance(row, dict) else getattr(row, "filepath", "")
    ).strip()
    if not filepath:
        return None
    return row_id, {
        "id": row_id,
        "filename": filename or "图片素材",
        "filepath": filepath,
        "required": bool(required),
        "origin": origin,
    }


def _append_image_appendix_slides(
    markdown_content: str,
    image_uploads: list[dict[str, Any]],
) -> str:
    if not image_uploads:
        return markdown_content

    frontmatter = extract_frontmatter(markdown_content or "")
    slides = parse_marp_slides(markdown_content or "")
    slide_contents: list[str] = [str(slide.get("content") or "") for slide in slides]
    if not slide_contents and str(markdown_content or "").strip():
        slide_contents = [markdown_content.strip()]

    for image_upload in image_uploads:
        filepath = _normalize_markdown_image_path(
            str(image_upload.get("filepath") or "").strip(),
            str(image_upload.get("filename") or "").strip(),
        )
        if not filepath:
            continue
        filename = str(image_upload.get("filename") or "图片素材").strip()
        slide_contents.append(
            (
                "# 图片参考\n\n" f"![w:900](<{filepath}>)\n\n" f"> 配图来源：{filename}"
            ).strip()
        )

    return reassemble_marp(frontmatter, slide_contents)


def _inject_image_blocks(
    markdown_content: str,
    image_uploads: list[dict[str, Any]],
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
        filepath = str(image_upload.get("filepath") or "").strip()
        filename = str(image_upload.get("filename") or "图片素材").strip()
        image_upload_id = str(image_upload.get("id") or "").strip()
        required_insertion = bool(image_upload.get("required"))
        image_origin = str(image_upload.get("origin") or "rag").strip()
        if not filepath:
            metadata_list.append(
                {
                    "slide_index": -1,
                    "image_insertion_decision": "skip",
                    "skip_reason": "invalid_image_filepath",
                    "image_upload_id": image_upload_id,
                    "required_insertion": required_insertion,
                    "image_origin": image_origin,
                    "image_match_reason": f"{image_origin}: {filename}",
                }
            )
            continue
        filepath = _normalize_markdown_image_path(filepath, filename)
        if not filepath:
            metadata_list.append(
                {
                    "slide_index": -1,
                    "image_insertion_decision": "skip",
                    "skip_reason": "invalid_image_filepath",
                    "image_upload_id": image_upload_id,
                    "required_insertion": required_insertion,
                    "image_origin": image_origin,
                    "image_match_reason": f"{image_origin}: {filename}",
                }
            )
            continue
        inserted = False

        while target_pointer < len(candidate_indices):
            target_index = candidate_indices[target_pointer]
            target_pointer += 1
            current_content = patched_contents[target_index].strip()

            if "![" in current_content:
                metadata_list.append(
                    {
                        "slide_index": target_index,
                        "image_insertion_decision": "skip",
                        "skip_reason": "slide_already_has_image",
                        "image_upload_id": image_upload_id,
                        "required_insertion": required_insertion,
                        "image_origin": image_origin,
                    }
                )
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
                        "image_upload_id": image_upload_id,
                        "required_insertion": required_insertion,
                        "image_origin": image_origin,
                    }
                )
                continue

            scores["keyword_coverage"] = 0.6
            patched_contents[target_index] = (
                f"{current_content}\n\n"
                f"![w:520](<{filepath}>)"
            ).strip()

            metadata_list.append(
                {
                    "slide_index": target_index,
                    "image_insertion_decision": "insert",
                    "page_semantic_type": semantic_type,
                    "layout_risk_level": layout_risk,
                    "image_count": 1,
                    "image_slot": "bottom_panel",
                    "image_match_reason": f"{image_origin}: {filename}",
                    "scores": scores,
                    "image_upload_id": image_upload_id,
                    "required_insertion": required_insertion,
                    "image_origin": image_origin,
                }
            )
            inserted = True
            break

        if not inserted:
            metadata_list.append(
                {
                    "slide_index": -1,
                    "image_insertion_decision": "skip",
                    "skip_reason": "no_available_slide",
                    "image_upload_id": image_upload_id,
                    "required_insertion": required_insertion,
                    "image_origin": image_origin,
                    "image_match_reason": f"{image_origin}: {filename}",
                }
            )

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
    normalized_source_ids = [str(item).strip() for item in (rag_source_ids or [])]
    normalized_source_ids = [item for item in normalized_source_ids if item]

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
    if not image_upload_ids and not normalized_source_ids:
        return {
            "retrieval_mode": retrieval_mode,
            "image_count": 0,
            "skip_reason": "no_rag_images",
        }

    upload_by_id: dict[str, dict[str, Any]] = {}
    ordered_candidate_ids: list[str] = []
    required_candidate_ids: list[str] = []

    if normalized_source_ids:
        selected_ready_rows = await find_many_with_select_fallback(
            model=db_service.db.upload,
            where={
                "projectId": project_id,
                "id": {"in": normalized_source_ids},
                "fileType": "image",
                "status": "ready",
            },
            select={"id": True, "filename": True, "filepath": True},
        )
        selected_by_id: dict[str, dict[str, Any]] = {}
        for row in selected_ready_rows or []:
            parsed = _to_image_upload_candidate(
                row,
                required=True,
                origin="selected_source",
            )
            if parsed is None:
                continue
            row_id, payload = parsed
            selected_by_id[row_id] = payload
        for source_id in normalized_source_ids:
            payload = selected_by_id.get(source_id)
            if payload is None or source_id in upload_by_id:
                continue
            upload_by_id[source_id] = payload
            ordered_candidate_ids.append(source_id)
            required_candidate_ids.append(source_id)

    if image_upload_ids:
        rag_hit_rows = await find_many_with_select_fallback(
            model=db_service.db.upload,
            where={
                "projectId": project_id,
                "id": {"in": image_upload_ids},
                "fileType": "image",
                "status": "ready",
            },
            select={"id": True, "filename": True, "filepath": True},
        )
        rag_hits_by_id: dict[str, dict[str, str]] = {}
        for row in rag_hit_rows or []:
            parsed = _to_image_upload_candidate(
                row,
                required=False,
                origin="rag_matched",
            )
            if parsed is None:
                continue
            row_id, payload = parsed
            rag_hits_by_id[row_id] = payload
        for upload_id in image_upload_ids:
            payload = rag_hits_by_id.get(upload_id)
            if payload is None or upload_id in upload_by_id:
                continue
            upload_by_id[upload_id] = payload
            ordered_candidate_ids.append(upload_id)

    if normalized_source_ids:
        project_ready_rows = await find_many_with_select_fallback(
            model=db_service.db.upload,
            where={
                "projectId": project_id,
                "fileType": "image",
                "status": "ready",
            },
            select={"id": True, "filename": True, "filepath": True},
        )
        for row in project_ready_rows or []:
            parsed = _to_image_upload_candidate(
                row,
                required=False,
                origin="project_ready",
            )
            if parsed is None:
                continue
            row_id, payload = parsed
            if row_id in upload_by_id:
                continue
            upload_by_id[row_id] = payload
            ordered_candidate_ids.append(row_id)

    if not ordered_candidate_ids:
        return {
            "retrieval_mode": retrieval_mode,
            "image_count": 0,
            "skip_reason": "no_ready_uploads",
        }

    required_uploads = [
        upload_by_id[upload_id]
        for upload_id in required_candidate_ids
        if upload_id in upload_by_id
    ]
    optional_ids = [
        item for item in ordered_candidate_ids if item not in required_candidate_ids
    ]
    optional_budget = max(0, max(1, max_images) - len(required_uploads))
    optional_uploads: list[dict[str, Any]] = []
    for upload_id in optional_ids:
        matched = upload_by_id.get(upload_id)
        if matched:
            optional_uploads.append(matched)
        if len(optional_uploads) >= optional_budget:
            break

    ordered_uploads: list[dict[str, Any]] = [*required_uploads, *optional_uploads]
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
    inserted_required_ids = {
        str(item.get("image_upload_id") or "").strip()
        for item in metadata_list
        if item.get("image_insertion_decision") == "insert"
        and bool(item.get("required_insertion"))
    }
    missing_required_uploads = [
        item
        for item in required_uploads
        if str(item.get("id") or "").strip() not in inserted_required_ids
    ]

    # 禁用独立参考页追加逻辑 - 图片应融入正文而非作为附录
    # appended_required_count = 0
    # if missing_required_uploads:
    #     base_markdown = (
    #         updated_markdown if updated_markdown.strip() else markdown_content
    #     )
    #     updated_markdown = _append_image_appendix_slides(
    #         base_markdown,
    #         missing_required_uploads,
    #     )
    #     appended_required_count = len(missing_required_uploads)
    #     for item in missing_required_uploads:
    #         metadata_list.append(
    #             {
    #                 "slide_index": -1,
    #                 "image_insertion_decision": "append_slide",
    #                 "required_insertion": True,
    #                 "image_upload_id": item.get("id"),
    #                 "image_origin": item.get("origin"),
    #                 "image_match_reason": f"selected_source: {item.get('filename')}",
    #                 "skip_reason": "forced_append_for_required_image",
    #             }
    #         )

    appended_required_count = 0

    if updated_markdown != markdown_content or appended_required_count > 0:
        setattr(courseware_content, "markdown_content", updated_markdown)
        render_markdown = str(getattr(courseware_content, "render_markdown", "") or "")
        if render_markdown.strip():
            updated_render_markdown, _ = _inject_image_blocks(
                render_markdown, ordered_uploads
            )
            if missing_required_uploads:
                updated_render_markdown = _append_image_appendix_slides(
                    updated_render_markdown,
                    missing_required_uploads,
                )
            if updated_render_markdown != render_markdown:
                setattr(courseware_content, "render_markdown", updated_render_markdown)

    inserted_count = len(
        [
            m
            for m in metadata_list
            if m.get("image_insertion_decision") in {"insert", "append_slide"}
        ]
    )
    return {
        "retrieval_mode": retrieval_mode,
        "image_count": inserted_count,
        "required_image_count": len(required_uploads),
        "required_inserted_count": len(required_uploads),
        "slides_metadata": metadata_list,
    }
