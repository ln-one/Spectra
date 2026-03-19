import os
from enum import Enum
from typing import Optional

from services.database import db_service
from utils.exceptions import ForbiddenException, NotFoundException

_DEFAULT_EXTENSIONS = {
    "pdf",
    "docx",
    "doc",
    "pptx",
    "ppt",
    "txt",
    "md",
    "csv",
    "mp4",
    "mov",
    "avi",
    "webm",
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "mp3",
    "wav",
    "m4a",
    "ogg",
}
_EXTRA_EXTENSIONS = {
    ext.strip().lower().lstrip(".")
    for ext in os.getenv("ALLOWED_EXTENSIONS", "").split(",")
    if ext.strip()
}
ALLOWED_EXTENSIONS = _DEFAULT_EXTENSIONS | _EXTRA_EXTENSIONS
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", str(100 * 1024 * 1024)))


class FileType(str, Enum):
    PDF = "pdf"
    WORD = "word"
    PPT = "ppt"
    VIDEO = "video"
    IMAGE = "image"
    OTHER = "other"


_MIME_FILE_TYPE_MAP = {
    "application/pdf": FileType.PDF,
    "application/msword": FileType.WORD,
    "application/vnd.ms-powerpoint": FileType.PPT,
}

_EXTENSION_FILE_TYPE_MAP = {
    "pdf": FileType.PDF,
    "docx": FileType.WORD,
    "doc": FileType.WORD,
    "txt": FileType.WORD,
    "md": FileType.WORD,
    "csv": FileType.WORD,
    "pptx": FileType.PPT,
    "ppt": FileType.PPT,
    "mp4": FileType.VIDEO,
    "mov": FileType.VIDEO,
    "avi": FileType.VIDEO,
    "webm": FileType.VIDEO,
    "jpg": FileType.IMAGE,
    "jpeg": FileType.IMAGE,
    "png": FileType.IMAGE,
    "gif": FileType.IMAGE,
    "webp": FileType.IMAGE,
}

_LEGACY_FILE_TYPE_ALIASES = {
    "document": FileType.WORD,
    "docx": FileType.WORD,
    "doc": FileType.WORD,
    "text": FileType.WORD,
    "txt": FileType.WORD,
    "md": FileType.WORD,
    "csv": FileType.WORD,
    "presentation": FileType.PPT,
    "pptx": FileType.PPT,
    "other": FileType.OTHER,
}


def normalize_file_type(file_type: str | FileType) -> FileType:
    if isinstance(file_type, FileType):
        return file_type

    normalized = (file_type or "").strip().lower()
    if normalized in FileType._value2member_map_:
        return FileType(normalized)

    alias = _LEGACY_FILE_TYPE_ALIASES.get(normalized)
    if alias is not None:
        return alias

    return FileType.PDF


def resolve_file_type(filename: str, mime_type: Optional[str] = None) -> str:
    ext = filename.split(".")[-1].lower() if "." in filename else ""
    if mime_type:
        normalized_mime = mime_type.strip().lower()
        if normalized_mime.startswith("text/"):
            return FileType.WORD.value
        if normalized_mime.startswith("video/"):
            return FileType.VIDEO.value
        if normalized_mime.startswith("image/"):
            return FileType.IMAGE.value
        if "wordprocessingml" in normalized_mime:
            return FileType.WORD.value
        if "presentationml" in normalized_mime:
            return FileType.PPT.value
        mapped_mime = _MIME_FILE_TYPE_MAP.get(normalized_mime)
        if mapped_mime is not None:
            return mapped_mime.value

    return _EXTENSION_FILE_TYPE_MAP.get(ext, FileType.PDF).value


async def verify_project_access(project_id: str, user_id: str):
    project = await db_service.get_project(project_id)
    if not project:
        raise NotFoundException(message=f"项目不存在: {project_id}")
    if project.userId != user_id:
        raise ForbiddenException(message="无权限访问此项目")
    return project


def validate_upload_file(filename: str):
    ext = filename.split(".")[-1].lower() if "." in filename else ""
    if not ext or ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"不支持的文件类型: {filename}")
