import html
import re


def build_cite_tag(item: dict) -> str:
    chunk_id = item.get("chunk_id")
    if not chunk_id:
        return ""
    filename = item.get("filename")
    escaped_chunk_id = html.escape(str(chunk_id), quote=True)
    attrs = [f'chunk_id="{escaped_chunk_id}"']
    if filename:
        escaped_filename = html.escape(str(filename), quote=True)
        attrs.append(f'filename="{escaped_filename}"')
    return "<cite " + " ".join(attrs) + "></cite>"


def append_citation_markers(content: str, citations: list[dict]) -> str:
    if not citations:
        return content

    def replace_numeric_marker(match: re.Match) -> str:
        idx = int(match.group(1)) - 1
        if idx < 0 or idx >= len(citations):
            return match.group(0)
        cite_tag = build_cite_tag(citations[idx])
        return cite_tag or match.group(0)

    converted = re.sub(r"\[(\d+)\]", replace_numeric_marker, content)
    if "<cite " in converted:
        return converted

    first_tag = build_cite_tag(citations[0])
    if not first_tag:
        return converted
    lines = converted.splitlines()
    if not lines:
        return converted
    for idx, line in enumerate(lines):
        stripped = line.strip()
        if stripped and not stripped.startswith(("#", "-", "*", ">")):
            lines[idx] = f"{line.rstrip()} {first_tag}"
            return "\n".join(lines)

    return f"{converted.rstrip()} {first_tag}"


def extract_cited_chunk_ids(content: str) -> list[str]:
    if not content:
        return []
    ids: list[str] = []
    for match in re.finditer(
        r'<cite\s+[^>]*chunk_id="([^"]+)"[^>]*>(?:\s*</cite>)?', content
    ):
        chunk_id = (match.group(1) or "").strip()
        if chunk_id:
            ids.append(chunk_id)
    return ids


def sanitize_cite_tags(content: str, citations: list[dict]) -> str:
    if not content:
        return content
    valid_ids = {
        str(item.get("chunk_id")).strip()
        for item in citations
        if isinstance(item, dict) and item.get("chunk_id")
    }
    if not valid_ids:
        return re.sub(r"<cite\b[^>]*>(?:\s*</cite>)?", "", content)

    def replace_invalid_tag(match: re.Match) -> str:
        tag = match.group(0)
        chunk_id_match = re.search(r'chunk_id="([^"]+)"', tag)
        if not chunk_id_match:
            return ""
        chunk_id = chunk_id_match.group(1).strip()
        return tag if chunk_id in valid_ids else ""

    return re.sub(r"<cite\b[^>]*>(?:\s*</cite>)?", replace_invalid_tag, content)


def align_citations_with_content(content: str, citations: list[dict]) -> list[dict]:
    if not citations:
        return []
    chunk_order = extract_cited_chunk_ids(content)
    if not chunk_order:
        return []

    by_chunk_id: dict[str, dict] = {}
    for item in citations:
        if not isinstance(item, dict):
            continue
        chunk_id = item.get("chunk_id")
        if not chunk_id:
            continue
        key = str(chunk_id).strip()
        if key and key not in by_chunk_id:
            by_chunk_id[key] = item

    ordered: list[dict] = []
    seen: set[str] = set()
    for chunk_id in chunk_order:
        if chunk_id in seen:
            continue
        seen.add(chunk_id)
        item = by_chunk_id.get(chunk_id)
        if item:
            ordered.append(item)
    return ordered


def strip_cite_tags(content: str) -> str:
    if not content:
        return content
    return re.sub(r"<cite\s+[^>]*>(?:\s*</cite>)?", "", content)
