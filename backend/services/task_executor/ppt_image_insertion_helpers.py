"""Pure helpers for PPT image insertion."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

from services.marp_utils import (
    extract_frontmatter,
    parse_marp_slides,
    reassemble_marp,
)

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


def is_image_filename(filename: str | None) -> bool:
    if not filename:
        return False
    lower = filename.strip().lower()
    return any(lower.endswith(ext) for ext in _IMAGE_EXTENSIONS)


def to_generated_relative_path(path: Path) -> str:
    try:
        relative = os.path.relpath(str(path), str(_GENERATED_ROOT))
        return Path(relative).as_posix()
    except ValueError:
        return path.as_posix()


def normalize_markdown_image_path(filepath: str, filename: str | None = None) -> str:
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
            return to_generated_relative_path(absolute_candidate)
        candidate = _BACKEND_ROOT / normalized[len("/app/") :]
        return to_generated_relative_path(candidate)

    if normalized.startswith("./uploads/"):
        candidate = _BACKEND_ROOT / normalized[2:]
        return to_generated_relative_path(candidate)

    if normalized.startswith("uploads/"):
        candidate = _BACKEND_ROOT / normalized
        return to_generated_relative_path(candidate)

    if "/" not in normalized and is_image_filename(filename or normalized):
        candidate = _BACKEND_ROOT / "uploads" / normalized
        return to_generated_relative_path(candidate)

    path_obj = Path(normalized)
    if path_obj.is_absolute():
        return to_generated_relative_path(path_obj)

    return to_generated_relative_path(_BACKEND_ROOT / path_obj)


def classify_page_semantic(title: str, content: str) -> tuple[str, dict]:
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


def assess_layout_risk(content: str, scores: dict) -> str:
    lines = [
        line_text.strip()
        for line_text in content.split("\n")
        if line_text.strip() and not line_text.strip().startswith("#")
    ]
    text_density = len(lines)

    if text_density > 8:
        scores["layout_capacity"] = 0.0
        return "high"
    if text_density > 5:
        scores["layout_capacity"] = 0.5
        return "medium"

    scores["layout_capacity"] = 1.0
    return "low"


def extract_rag_image_upload_ids(rag_context: list[dict] | None) -> list[str]:
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
        if source_type == "image" or is_image_filename(filename):
            if upload_id not in image_upload_ids:
                image_upload_ids.append(upload_id)
    return image_upload_ids


def to_image_upload_candidate(
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


def append_image_appendix_slides(
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
        filepath = normalize_markdown_image_path(
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


def inject_image_blocks(
    markdown_content: str,
    image_uploads: list[dict[str, Any]],
) -> tuple[str, list[dict]]:
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
        filepath = normalize_markdown_image_path(filepath, filename)
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
            semantic_type, scores = classify_page_semantic(title, current_content)
            layout_risk = assess_layout_risk(current_content, scores)

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
                f"{current_content}\n\n" f"![w:520](<{filepath}>)"
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
