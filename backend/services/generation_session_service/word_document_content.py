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

        heading_match = re.match(r"^(#{1,6})\s+(.+)$", line)
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
            normalized["attrs"] = {
                "level": level if level in {1, 2, 3, 4, 5, 6} else 2
            }
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
            if isinstance(attrs, dict) and attrs.get("level") in {1, 2, 3, 4, 5, 6}:
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


def _split_markdown_table_row(line: str) -> list[str]:
    stripped = str(line or "").strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|"):
        stripped = stripped[:-1]
    return [cell.strip() for cell in stripped.split("|")]


def _is_markdown_table_separator(line: str) -> bool:
    cells = _split_markdown_table_row(line)
    if not cells:
        return False
    has_dash = False
    for cell in cells:
        normalized = cell.replace(":", "").replace("-", "").strip()
        if normalized:
            return False
        if "-" in cell:
            has_dash = True
    return has_dash


def _is_markdown_table_row(line: str) -> bool:
    stripped = str(line or "").strip()
    return stripped.count("|") >= 2


def _render_markdown_table(block_lines: list[str]) -> str:
    if len(block_lines) < 2:
        return ""
    header = _split_markdown_table_row(block_lines[0])
    body_lines = block_lines[2:]
    rows = [_split_markdown_table_row(line) for line in body_lines if _is_markdown_table_row(line)]
    thead = "".join(f"<th>{html.escape(cell)}</th>" for cell in header)
    tbody_rows = []
    for row in rows:
        cells = "".join(f"<td>{html.escape(cell)}</td>" for cell in row)
        tbody_rows.append(f"<tr>{cells}</tr>")
    tbody = "".join(tbody_rows)
    return f"<table><thead><tr>{thead}</tr></thead><tbody>{tbody}</tbody></table>"


def lesson_plan_markdown_to_html(markdown: str, *, title: str, summary: str) -> str:
    lines = str(markdown or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    body_parts = [
        f"<h1>{html.escape(title)}</h1>",
        f"<p class=\"lede\">{html.escape(summary)}</p>" if summary.strip() else "",
    ]
    index = 0

    while index < len(lines):
        raw_line = lines[index]
        stripped = raw_line.strip()
        if not stripped:
            index += 1
            continue

        heading_match = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if heading_match:
            level = len(heading_match.group(1))
            html_level = min(level + 1, 6)
            body_parts.append(
                f"<h{html_level}>{html.escape(heading_match.group(2).strip())}</h{html_level}>"
            )
            index += 1
            continue

        if (
            index + 1 < len(lines)
            and _is_markdown_table_row(stripped)
            and _is_markdown_table_separator(lines[index + 1])
        ):
            table_lines = [stripped, lines[index + 1].strip()]
            index += 2
            while index < len(lines) and _is_markdown_table_row(lines[index].strip()):
                table_lines.append(lines[index].strip())
                index += 1
            rendered_table = _render_markdown_table(table_lines)
            if rendered_table:
                body_parts.append(rendered_table)
                continue

        bullet_match = re.match(r"^[-*+]\s+(.+)$", stripped)
        if bullet_match:
            items: list[str] = []
            while index < len(lines):
                match = re.match(r"^[-*+]\s+(.+)$", lines[index].strip())
                if not match:
                    break
                items.append(match.group(1).strip())
                index += 1
            body_parts.append(_render_list(items, ordered=False))
            continue

        ordered_match = re.match(r"^\d+\.\s+(.+)$", stripped)
        if ordered_match:
            items = []
            while index < len(lines):
                match = re.match(r"^\d+\.\s+(.+)$", lines[index].strip())
                if not match:
                    break
                items.append(match.group(1).strip())
                index += 1
            body_parts.append(_render_list(items, ordered=True))
            continue

        paragraph_lines = [stripped]
        index += 1
        while index < len(lines):
            candidate = lines[index].strip()
            if not candidate:
                break
            if re.match(r"^(#{1,6})\s+(.+)$", candidate):
                break
            if re.match(r"^[-*+]\s+(.+)$", candidate):
                break
            if re.match(r"^\d+\.\s+(.+)$", candidate):
                break
            if (
                index + 1 < len(lines)
                and _is_markdown_table_row(candidate)
                and _is_markdown_table_separator(lines[index + 1])
            ):
                break
            paragraph_lines.append(candidate)
            index += 1
        body_parts.append(f"<p>{html.escape(' '.join(paragraph_lines))}</p>")

    body = "".join(part for part in body_parts if part)
    return (
        "<!doctype html><html><head><meta charset=\"utf-8\" />"
        "<title>Word Preview</title></head><body><main>"
        f"{body}"
        "</main></body></html>"
    )


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
            level = (
                attrs.get("level") if attrs.get("level") in {1, 2, 3, 4, 5, 6} else 2
            )
            html_level = min(int(level) + 1, 6)
            body_parts.append(f"<h{html_level}>{html.escape(text)}</h{html_level}>")
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
