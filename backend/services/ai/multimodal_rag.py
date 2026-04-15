from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path

from services.rag_api_service.source_images import load_source_image_payload

_VISUAL_QUERY_PATTERNS = (
    r"这张图",
    r"那张图",
    r"图片",
    r"截图",
    r"配图",
    r"插图",
    r"图表",
    r"表格",
    r"示意图",
    r"流程图",
    r"页面",
    r"页码",
    r"版面",
    r"布局",
    r"\bimage\b",
    r"\bfigure\b",
    r"\bchart\b",
    r"\bdiagram\b",
    r"\bscreenshot\b",
    r"\bpage\b",
    r"\blayout\b",
    r"\btable\b",
    r"\bvisual\b",
)
_VISUAL_QUERY_RE = re.compile("|".join(_VISUAL_QUERY_PATTERNS), re.IGNORECASE)
_MARKDOWN_IMAGE_RE = re.compile(r"!\[[^\]]*\]\((images/[^)\s]+)\)", re.IGNORECASE)


def has_visual_retrieval_intent(query: str) -> bool:
    return bool(_VISUAL_QUERY_RE.search(str(query or "")))


def extract_image_paths(content: str) -> list[str]:
    paths: list[str] = []
    seen: set[str] = set()
    for raw_path in _MARKDOWN_IMAGE_RE.findall(str(content or "")):
        path = str(raw_path or "").strip()
        if not path or path in seen:
            continue
        seen.add(path)
        paths.append(path)
    return paths


async def build_multimodal_context(service, *, query: str, rag_results) -> list[dict]:
    if not has_visual_retrieval_intent(query):
        return []
    if not hasattr(service, "analyze_images_for_chat"):
        return []

    image_inputs: list[dict[str, str]] = []
    support_items: list[dict] = []
    temp_paths: list[str] = []
    seen_refs: set[tuple[str, str]] = set()

    try:
        for item in rag_results or []:
            source = getattr(item, "source", None)
            if source is None:
                continue
            chunk_id = str(getattr(source, "chunk_id", "") or "").strip()
            if not chunk_id:
                continue
            image_paths = extract_image_paths(getattr(item, "content", ""))
            for image_path in image_paths:
                ref = (chunk_id, image_path)
                if ref in seen_refs:
                    continue
                seen_refs.add(ref)
                payload = await load_source_image_payload(
                    chunk_id=chunk_id,
                    image_path=image_path,
                )
                suffix = Path(image_path).suffix or ".png"
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    tmp.write(payload.content)
                    temp_path = tmp.name
                temp_paths.append(temp_path)
                image_inputs.append(
                    {
                        "filepath": temp_path,
                        "filename": str(getattr(source, "filename", "") or ""),
                        "chunk_id": chunk_id,
                        "image_path": image_path,
                    }
                )
                support_items.append(
                    {
                        "chunk_id": chunk_id,
                        "filename": str(getattr(source, "filename", "") or ""),
                        "page_number": getattr(source, "page_number", None),
                        "score": float(getattr(item, "score", 0.0) or 0.0),
                        "image_path": image_path,
                        "source_type": getattr(source, "source_type", "document"),
                    }
                )
                if len(image_inputs) >= 2:
                    break
            if len(image_inputs) >= 2:
                break

        if not image_inputs:
            return []

        analysis = await service.analyze_images_for_chat(
            user_message=query,
            image_inputs=image_inputs,
        )
        if (
            not isinstance(analysis, dict)
            or not str(analysis.get("content") or "").strip()
        ):
            return []

        primary = support_items[0]
        image_labels = "，".join(
            f"{item['filename']}#{item['image_path']}" for item in support_items
        )
        content = (
            "来源图片可视解析补充（仅基于图中可见信息）："
            f"\n{str(analysis['content']).strip()}"
            f"\n关联图片：{image_labels}"
        )
        return [
            {
                "chunk_id": primary["chunk_id"],
                "content": content,
                "score": primary["score"],
                "source": {
                    "chunk_id": primary["chunk_id"],
                    "source_type": primary["source_type"],
                    "filename": primary["filename"],
                    "page_number": primary["page_number"],
                },
                "metadata": {
                    "multimodal_provider": "visual_hint_adapter",
                    "multimodal_model": str(analysis.get("model") or "").strip()
                    or None,
                    "multimodal_image_count": len(image_inputs),
                    "multimodal_support_refs": support_items,
                },
            }
        ]
    finally:
        for temp_path in temp_paths:
            try:
                os.unlink(temp_path)
            except OSError:
                continue
