from __future__ import annotations

from enum import Enum

from services.library_semantics import (
    SILENT_ACCRETION_USAGE_INTENT as _SILENT_ACCRETION_USAGE_INTENT,
)


class UploadStatus(str, Enum):
    UPLOADING = "uploading"
    PARSING = "parsing"
    READY = "ready"
    FAILED = "failed"


SILENT_ACCRETION_USAGE_INTENT = _SILENT_ACCRETION_USAGE_INTENT


UPLOAD_STATUS_PROGRESS: dict[str, int] = {
    UploadStatus.UPLOADING.value: 0,
    UploadStatus.PARSING.value: 50,
    UploadStatus.READY.value: 100,
    UploadStatus.FAILED.value: 100,
}
