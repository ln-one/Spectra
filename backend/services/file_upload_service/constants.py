from __future__ import annotations

from enum import Enum


class UploadStatus(str, Enum):
    UPLOADING = "uploading"
    PARSING = "parsing"
    READY = "ready"
    FAILED = "failed"


UPLOAD_STATUS_PROGRESS: dict[str, int] = {
    UploadStatus.UPLOADING.value: 0,
    UploadStatus.PARSING.value: 50,
    UploadStatus.READY.value: 100,
    UploadStatus.FAILED.value: 100,
}
