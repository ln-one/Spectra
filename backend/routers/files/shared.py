import logging

from pydantic import BaseModel, Field

from utils.file_utils import cleanup_file

logger = logging.getLogger(__name__)


class UpdateFileIntentRequest(BaseModel):
    """标注文件用途请求"""

    usage_intent: str


class BatchDeleteRequest(BaseModel):
    file_ids: list[str]


class MineruParseResultRequest(BaseModel):
    parsed_text: str
    parse_details: dict = Field(default_factory=dict)
    session_id: str | None = None


__all__ = [
    "BatchDeleteRequest",
    "MineruParseResultRequest",
    "UpdateFileIntentRequest",
    "cleanup_file",
    "logger",
]
