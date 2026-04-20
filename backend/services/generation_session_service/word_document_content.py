from __future__ import annotations

import html
import re
from typing import Any


ALLOWED_DOC_NODES = {
    "doc",
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "listItem",
    "text",
    "hardBreak",
}


def _text_node(text: str) -> dict[str, Any]:
    return {"type": "text", "text": text}


def _paragraph_node(text: str) -> dict[str, Any]:
    return {"type": "paragraph", "content": [_text_node(text)]}


def _build_list_node(lines: list[str], *, ordered: bool) -> dict[str, Any]:
    return {
        "type": "orderedList" if ordered else "bulletList",
        "content": [
            {"type": "listItem", "content": [_paragraph_node(line)]}
            for line in lines
            if line
        ],
    }


def markdown_to_document_content(markdown: str) -> dict[str, Any]:
    content: list[dict[str, Any]] = []
    paragraph_buffer: list[str] = []
    list_buffer: list[str] = []
    list_ordered: bool | None = None

    def flush_paragraph() -> None:
        nonlocal paragraph_buffer
        text = " ".join(part.strip() for part in paragraph_buffer if part.strip()).strip()
        if text:
            content.append(_paragraph_node(text))
        paragraph_buffer = []

    def flush_list() -> None:
        nonlocal list_buffer, list_ordered
        if list_buffer:
            content.append(
                _build_list_node(
                    [line for line in list_buffer if line],
                    ordered=bool(list_ordered),
                )
            )
        list_buffer = []
        list_ordered = None

    for raw_line in str(markdown or "").splitlines():
        line = raw_line.strip()
        if not line:
            flush_paragraph()
            flush_list()
            continue

        heading_match = re.match(r"^(#{1,3})\s+(.+)$", line)
        if heading_match:
            flush_paragraph()
            flush_list()
            content.append(
                {
                    "type": "heading",
                    "attrs": {"level": len(heading_match.group(1))},
                    "content": [_text_node(heading_match.group(2).strip())],
                }
            )
            continue

        bullet_match = re.match(r"^[-*+]\s+(.+)$", line)
        if bullet_match:
            flush_paragraph()
            if list_ordered is True:
                flush_list()
            list_ordered = False
            list_buffer.append(bullet_match.group(1).strip())
            continue

        ordered_match = re.match(r"^\d+\.\s+(.+)$", line)
        if ordered_match:
            flush_paragraph()
            if list_ordered is False:
                flush_list()
            list_ordered = True
            list_buffer.append(ordered_match.group(1).strip())
            continue

        flush_list()
        paragraph_buffer.append(line)

    flush_paragraph()
    flush_list()
    return {"type": "doc", "content": content or [_paragraph_node("暂无可展示正文。")]}


def normalize_document_content(document: Any) -> dict[str, Any]:
    if not isinstance(document, dict) or document.get("type") != "doc":
        raise ValueError("field_document_content")

    def normalize_node(node: Any) -> dict[str, Any]:
        if not isinstance(node, dict):
            raise ValueError("field_document_content")
        node_type = str(node.get("type") or "").strip()
        if node_type not in ALLOWED_DOC_NODES:
            raise ValueError("field_document_content")
        normalized: dict[str, Any] = {"type": node_type}
        if node_type == "heading":
            attrs = node.get("attrs") if isinstance(node.get("attrs"), dict) else {}
            level = attrs.get("level")
            normalized["attrs"] = {"level": level if level in {1, 2, 3} else 2}
        if node_type == "text":
            text = str(node.get("text") or "").strip()
            if not text:
                raise ValueError("field_document_content")
            normalized["text"] = text
            return normalized
        if node_type == "hardBreak":
            return normalized
        raw_content = node.get("content")
        if isinstance(raw_content, list):
            child_nodes = [normalize_node(child) for child in raw_content]
            if child_nodes:
                normalized["content"] = child_nodes
        elif node_type in {"paragraph", "heading", "listItem"}:
            raise ValueError("field_document_content")
        return normalized

    normalized_content = [normalize_node(item) for item in document.get("content") or []]
    if not normalized_content:
        raise ValueError("field_document_content")
    return {"type": "doc", "content": normalized_content}


def _extract_text(content: Any) -> str:
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for item in content:
        if not isinstance(item, dict):
            continue
        item_type = str(item.get("type") or "")
        if item_type == "text":
            text = str(item.get("text") or "")
            if text:
                parts.append(text)
        elif item_type == "hardBreak":
            parts.append("\n")
        else:
            nested = _extract_text(item.get("content"))
            if nested:
                parts.append(nested)
    return "".join(parts).strip()


def document_content_to_markdown(document: dict[str, Any]) -> str:
    lines: list[str] = []
    for node in document.get("content") or []:
        if not isinstance(node, dict):
            continue
        node_type = str(node.get("type") or "")
        if node_type == "heading":
            level = 2
            attrs = node.get("attrs")
            if isinstance(attrs, dict) and attrs.get("level") in {1, 2, 3}:
                level = int(attrs["level"])
            text = _extract_text(node.get("content"))
            lines.extend([f"{'#' * level} {text}", ""])
        elif node_type == "paragraph":
            text = _extract_text(node.get("content"))
            lines.extend([text, ""])
        elif node_type in {"bulletList", "orderedList"}:
            items = node.get("content") if isinstance(node.get("content"), list) else []
            for index, item in enumerate(items, start=1):
                text = _extract_text(item.get("content") if isinstance(item, dict) else None)
                prefix = f"{index}. " if node_type == "orderedList" else "- "
                lines.append(f"{prefix}{text}")
            lines.append("")
    return "\n".join(lines).strip()


def _render_list(items: list[str], *, ordered: bool) -> str:
    tag = "ol" if ordered else "ul"
    body = "".join(f"<li>{html.escape(item)}</li>" for item in items if item)
    return f"<{tag}>{body}</{tag}>"


def document_content_to_html(document: dict[str, Any], *, title: str, summary: str) -> str:
    body_parts = [
        f"<h1>{html.escape(title)}</h1>",
        f"<p class=\"lede\">{html.escape(summary)}</p>" if summary.strip() else "",
    ]
    for node in document.get("content") or []:
        if not isinstance(node, dict):
            continue
        node_type = str(node.get("type") or "")
        text = _extract_text(node.get("content"))
        if node_type == "heading":
            attrs = node.get("attrs") if isinstance(node.get("attrs"), dict) else {}
            level = attrs.get("level") if attrs.get("level") in {1, 2, 3} else 2
            body_parts.append(f"<h{level + 1}>{html.escape(text)}</h{level + 1}>")
        elif node_type == "paragraph":
            body_parts.append(f"<p>{html.escape(text)}</p>")
        elif node_type in {"bulletList", "orderedList"}:
            items = node.get("content") if isinstance(node.get("content"), list) else []
            body_parts.append(
                _render_list(
                    [
                        _extract_text(item.get("content") if isinstance(item, dict) else None)
                        for item in items
                    ],
                    ordered=node_type == "orderedList",
                )
            )
    body = "".join(part for part in body_parts if part)
    return (
        "<!doctype html><html><head><meta charset=\"utf-8\" />"
        "<title>Word Preview</title></head><body><main>"
        f"{body}"
        "</main></body></html>"
    )
