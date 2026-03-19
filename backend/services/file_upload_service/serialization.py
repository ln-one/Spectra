import json
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def derive_parse_progress(status: Optional[str]) -> Optional[int]:
    if not status:
        return None
    status_l = status.lower()
    if status_l in {"ready", "failed"}:
        return 100
    if status_l == "parsing":
        return 50
    if status_l == "uploading":
        return 0
    return None


def safe_parse_json_object(value: Any) -> Optional[dict]:
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Invalid parseResult JSON during upload serialization")
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def extract_parse_details(parse_result: Optional[dict]) -> Optional[dict]:
    if not parse_result:
        return None
    keys = {"pages_extracted", "images_extracted", "text_length", "duration"}
    details = {k: parse_result[k] for k in keys if k in parse_result}
    return details or None


def serialize_upload(upload: Any) -> dict:
    parse_result = safe_parse_json_object(getattr(upload, "parseResult", None))
    status = getattr(upload, "status", None)
    return {
        "id": getattr(upload, "id", None),
        "filename": getattr(upload, "filename", None),
        "file_type": getattr(upload, "fileType", None),
        "mime_type": getattr(upload, "mimeType", None),
        "file_size": getattr(upload, "size", None),
        "status": status,
        "parse_progress": derive_parse_progress(status),
        "parse_details": extract_parse_details(parse_result),
        "parse_error": getattr(upload, "errorMessage", None),
        "usage_intent": getattr(upload, "usageIntent", None),
        "parse_result": parse_result,
        "created_at": getattr(upload, "createdAt", None),
        "updated_at": getattr(upload, "updatedAt", None),
    }
