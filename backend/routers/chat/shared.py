import json
import logging

from fastapi import APIRouter
from fastapi.encoders import jsonable_encoder

from schemas.chat import Message
from services.application.access import get_owned_project
from utils.exceptions import ErrorCode, ForbiddenException, NotFoundException

from .citation_utils import strip_cite_tags

router = APIRouter(prefix="/chat", tags=["Chat"])
logger = logging.getLogger(__name__)


async def verify_project_ownership(project_id: str, user_id: str):
    """Return project if owned by user, else raise 403."""
    try:
        return await get_owned_project(project_id, user_id)
    except (ForbiddenException, NotFoundException) as exc:
        raise ForbiddenException(
            message="无权访问该项目",
            error_code=ErrorCode.FORBIDDEN,
        ) from exc


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
    except Exception as exc:
        logger.debug("to_message_fallback_used: id=%s error=%s", conv.id, exc)
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


def normalize_markdown_paragraphs(content: str) -> str:
    if not content or "\n\n" in content:
        return content
    from re import split

    sentences = [s.strip() for s in split(r"(?<=[。！？!?])\s*", content) if s.strip()]
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
