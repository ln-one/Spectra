import logging

from pydantic import BaseModel

from utils.file_utils import cleanup_file

logger = logging.getLogger(__name__)


class UpdateFileIntentRequest(BaseModel):
    """标注文件用途请求"""

    usage_intent: str


class BatchDeleteRequest(BaseModel):
    file_ids: list[str]


__all__ = [
    "BatchDeleteRequest",
    "UpdateFileIntentRequest",
    "cleanup_file",
    "logger",
]
