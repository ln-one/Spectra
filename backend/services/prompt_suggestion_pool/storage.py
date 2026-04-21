from __future__ import annotations

import hashlib
import json
from typing import Any

from schemas.rag import PromptSuggestionStatus, PromptSuggestionSurface
from services.database import db_service

from .constants import PROMPT_SUGGESTION_CACHE_TTL_SECONDS
from .normalization import cache_status, normalize_datetime, utc_now


async def get_cache(db, project_id: str, surface: PromptSuggestionSurface):
    model = getattr(db.db, "promptsuggestioncache")
    return await model.find_first(
        where={"projectId": project_id, "surface": surface.value}
    )


async def upsert_cache(db, project_id: str, surface: PromptSuggestionSurface, data):
    model = getattr(db.db, "promptsuggestioncache")
    existing = await get_cache(db, project_id, surface)
    payload = dict(data)
    if existing:
        return await model.update(where={"id": existing.id}, data=payload)
    payload.update({"projectId": project_id, "surface": surface.value})
    return await model.create(data=payload)


async def build_project_source_fingerprint(
    project_id: str,
    *,
    db=db_service,
) -> tuple[str, int]:
    uploads = await db.db.upload.find_many(
        where={"projectId": project_id, "status": "ready"},
        order={"updatedAt": "asc"},
    )
    entries = [
        {
            "id": upload.id,
            "filename": upload.filename,
            "fileType": upload.fileType,
            "size": upload.size,
            "updatedAt": str(upload.updatedAt),
        }
        for upload in uploads
    ]
    digest = hashlib.sha256(
        json.dumps(entries, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()
    return digest, len(entries)


def cache_is_expired(record: Any) -> bool:
    generated_at = normalize_datetime(getattr(record, "generatedAt", None))
    if generated_at is None:
        return True
    age = (utc_now() - generated_at).total_seconds()
    return age > PROMPT_SUGGESTION_CACHE_TTL_SECONDS


async def mark_generating(
    *,
    db,
    project_id: str,
    surface: PromptSuggestionSurface,
    source_fingerprint: str,
):
    await upsert_cache(
        db,
        project_id,
        surface,
        {
            "status": PromptSuggestionStatus.GENERATING.value,
            "sourceFingerprint": source_fingerprint,
            "refreshRequestedAt": utc_now(),
            "errorCode": None,
            "errorMessage": None,
        },
    )


def should_refresh(
    record: Any | None,
    *,
    source_fingerprint: str,
    force: bool,
) -> bool:
    if force or record is None:
        return True
    status_value = cache_status(record)
    if (
        status_value == PromptSuggestionStatus.GENERATING
        and getattr(record, "sourceFingerprint", None) == source_fingerprint
    ):
        return False
    if getattr(record, "sourceFingerprint", None) != source_fingerprint:
        return True
    if status_value in {
        PromptSuggestionStatus.FAILED,
        PromptSuggestionStatus.EMPTY,
    }:
        return True
    return cache_is_expired(record)


def resolve_response_status(
    record: Any | None,
    *,
    needs_refresh: bool,
    has_suggestions: bool,
) -> PromptSuggestionStatus:
    if record is None:
        return PromptSuggestionStatus.GENERATING
    status_value = cache_status(record)
    if needs_refresh and has_suggestions:
        return PromptSuggestionStatus.STALE
    return status_value
