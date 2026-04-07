"""PPT image insertion helpers for generation runtime."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from services.database.prisma_compat import find_many_with_select_fallback
from services.task_executor.ppt_image_insertion_helpers import (
    append_image_appendix_slides,
    extract_rag_image_upload_ids,
    inject_image_blocks,
    normalize_markdown_image_path,
    to_image_upload_candidate,
)

logger = logging.getLogger(__name__)


def _is_image_filename(filename: str | None) -> bool:
    from services.task_executor.ppt_image_insertion_helpers import is_image_filename

    return is_image_filename(filename)


def _to_generated_relative_path(path: Path) -> str:
    from services.task_executor.ppt_image_insertion_helpers import (
        to_generated_relative_path,
    )

    return to_generated_relative_path(path)


def _normalize_markdown_image_path(filepath: str, filename: str | None = None) -> str:
    return normalize_markdown_image_path(filepath, filename)


def _extract_rag_image_upload_ids(rag_context: list[dict] | None) -> list[str]:
    return extract_rag_image_upload_ids(rag_context)


def _to_image_upload_candidate(
    row,
    *,
    required: bool,
    origin: str,
) -> tuple[str, dict[str, Any]] | None:
    return to_image_upload_candidate(row, required=required, origin=origin)


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
    updated_markdown, metadata_list = inject_image_blocks(
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

    # 必需图片未能插入正文时不追加附录页（图片应融入正文而非附录）
    appended_required_count = 0

    if updated_markdown != markdown_content or appended_required_count > 0:
        setattr(courseware_content, "markdown_content", updated_markdown)
        render_markdown = str(getattr(courseware_content, "render_markdown", "") or "")
        if render_markdown.strip():
            updated_render_markdown, _ = inject_image_blocks(
                render_markdown, ordered_uploads
            )
            if missing_required_uploads:
                updated_render_markdown = append_image_appendix_slides(
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
