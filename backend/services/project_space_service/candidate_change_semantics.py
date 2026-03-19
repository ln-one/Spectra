"""Shared candidate-change semantics across Project Space and session flows."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional


def parse_json_object(value: Any) -> Optional[dict]:
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
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def extract_candidate_change_review(payload: Any) -> Optional[dict]:
    parsed = parse_json_object(payload)
    review = parsed.get("review") if isinstance(parsed, dict) else None
    return review if isinstance(review, dict) else None


def extract_accepted_version_id(payload: Any) -> Optional[str]:
    review = extract_candidate_change_review(payload)
    accepted_version_id = review.get("accepted_version_id") if review else None
    if accepted_version_id is None:
        return None
    normalized = str(accepted_version_id).strip()
    return normalized or None


def _serialize_datetime(value: Any, *, isoformat: bool) -> Any:
    if not isoformat:
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    return None


def serialize_candidate_change(change: Any, *, isoformat_datetimes: bool) -> dict:
    payload = parse_json_object(getattr(change, "payload", None))
    return {
        "id": change.id,
        "project_id": change.projectId,
        "session_id": change.sessionId,
        "base_version_id": change.baseVersionId,
        "title": change.title,
        "summary": change.summary,
        "payload": payload,
        "status": change.status,
        "review_comment": getattr(change, "reviewComment", None),
        "accepted_version_id": extract_accepted_version_id(payload),
        "proposer_user_id": change.proposerUserId,
        "created_at": _serialize_datetime(
            getattr(change, "createdAt", None),
            isoformat=isoformat_datetimes,
        ),
        "updated_at": _serialize_datetime(
            getattr(change, "updatedAt", None),
            isoformat=isoformat_datetimes,
        ),
    }
