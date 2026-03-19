import json
import logging
import re
from typing import Optional

from fastapi import APIRouter
from fastapi.encoders import jsonable_encoder

from schemas.chat import Message
from services.database import db_service
from utils.exceptions import ErrorCode, ForbiddenException

router = APIRouter(prefix="/chat", tags=["Chat"])
logger = logging.getLogger(__name__)


async def verify_project_ownership(project_id: str, user_id: str):
    """Return project if owned by user, else raise 403."""
    project = await db_service.get_project(project_id)
    if not project or project.userId != user_id:
        raise ForbiddenException(
            message="无权访问该项目",
            error_code=ErrorCode.FORBIDDEN,
        )
    return project


def to_message(conv) -> dict:
    """Convert Prisma Conversation record to API message payload."""
    role = getattr(conv, "role", None)
    metadata = getattr(conv, "metadata", None)
    parsed_metadata = {}
    if isinstance(metadata, str):
        try:
            parsed_metadata = json.loads(metadata)
        except json.JSONDecodeError:
            parsed_metadata = {}
    elif isinstance(metadata, dict):
        parsed_metadata = metadata

    citations = parsed_metadata.get("citations")
    if not isinstance(citations, list):
        citations = [] if role == "assistant" else None
    content = conv.content
    if role == "assistant":
        content = strip_cite_tags(content)

    try:
        return Message(
            id=conv.id,
            role=conv.role,
            content=content,
            timestamp=conv.createdAt,
            citations=citations,
        ).model_dump(mode="json")
    except Exception:
        return Message(
            id=conv.id,
            role=conv.role,
            content=content,
            timestamp=conv.createdAt,
            citations=[] if role == "assistant" else None,
        ).model_dump(mode="json")


def dump_capability_status(capability_status) -> dict:
    model_dump = getattr(capability_status, "model_dump", None)
    if callable(model_dump):
        try:
            return model_dump(mode="json")
        except TypeError:
            return model_dump()
    return jsonable_encoder(capability_status)


def build_cite_tag(item: dict) -> str:
    chunk_id = item.get("chunk_id")
    if not chunk_id:
        return ""
    filename = item.get("filename")
    attrs = [f'chunk_id="{chunk_id}"']
    if filename:
        attrs.append(f'filename="{filename}"')
    return "<cite " + " ".join(attrs) + "></cite>"


def normalize_markdown_paragraphs(content: str) -> str:
    if not content or "\n\n" in content:
        return content
    sentences = [
        s.strip() for s in re.split(r"(?<=[。！？!?])\s*", content) if s.strip()
    ]
    if len(sentences) < 3:
        return content
    paragraphs: list[str] = []
    for i in range(0, len(sentences), 2):
        chunk = " ".join(sentences[i : i + 2]).strip()
        if chunk:
            paragraphs.append(chunk)
    if len(paragraphs) <= 1:
        return content
    return "\n\n".join(paragraphs)


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


def normalize_chapter_token(token: str) -> str:
    return token.replace(" ", "")


def chinese_to_arabic(ch: str) -> Optional[int]:
    mapping = {
        "一": 1,
        "二": 2,
        "三": 3,
        "四": 4,
        "五": 5,
        "六": 6,
        "七": 7,
        "八": 8,
        "九": 9,
        "十": 10,
    }
    return mapping.get(ch)


def extract_chapter_tokens(query: str) -> list[str]:
    tokens: list[str] = []
    if not query:
        return tokens

    for match in re.findall(r"第\\s*([0-9]+)\\s*章", query):
        tokens.append(f"第{match}章")

    for match in re.findall(r"第\\s*([一二三四五六七八九十])\\s*章", query):
        tokens.append(f"第{match}章")
        arabic = chinese_to_arabic(match)
        if arabic is not None:
            tokens.append(f"第{arabic}章")

    seen = set()
    ordered = []
    for token in tokens:
        token = normalize_chapter_token(token)
        if token in seen:
            continue
        seen.add(token)
        ordered.append(token)
    return ordered


def rerank_by_chapter(query: str, rag_results: list):
    tokens = extract_chapter_tokens(query)
    if not tokens or not rag_results:
        return rag_results

    scored = []
    for result in rag_results:
        content = str(getattr(result, "content", "") or "")
        filename = str(getattr(getattr(result, "source", None), "filename", "") or "")
        match_score = 0
        for token in tokens:
            if token in content:
                match_score += 2
            if token in filename:
                match_score += 1
        scored.append((match_score, result))

    if not any(score > 0 for score, _ in scored):
        return rag_results

    scored.sort(key=lambda item: (item[0], getattr(item[1], "score", 0)), reverse=True)
    return [result for _, result in scored]
