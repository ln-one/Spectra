import os
from typing import Optional

from services import db_service
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


def resolve_file_type(filename: str, mime_type: Optional[str] = None) -> str:
    ext = filename.split(".")[-1].lower() if "." in filename else ""
    if mime_type:
        if mime_type == "application/pdf":
            return "pdf"
        if mime_type.startswith("text/"):
            return "word"
        if "wordprocessingml" in mime_type or mime_type in {"application/msword"}:
            return "word"
        if "presentationml" in mime_type or mime_type in {
            "application/vnd.ms-powerpoint"
        }:
            return "ppt"
        if mime_type.startswith("video/"):
            return "video"
        if mime_type.startswith("image/"):
            return "image"

    file_type_map = {
        "pdf": "pdf",
        "docx": "word",
        "doc": "word",
        "txt": "word",
        "md": "word",
        "csv": "word",
        "pptx": "ppt",
        "ppt": "ppt",
        "mp4": "video",
        "mov": "video",
        "avi": "video",
        "webm": "video",
        "jpg": "image",
        "jpeg": "image",
        "png": "image",
        "gif": "image",
        "webp": "image",
    }
    return file_type_map.get(ext, "pdf")


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
