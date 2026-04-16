from __future__ import annotations

import re
from typing import Optional


def normalize_username(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", (value or "").strip())
    cleaned = cleaned.strip("_-")
    if len(cleaned) < 3:
        cleaned = f"user_{cleaned}".strip("_")
    return cleaned[:50] or "user"


async def resolve_username(
    service,
    *,
    identity_id: str,
    preferred_username: Optional[str],
    email: str,
) -> str:
    existing = await service.get_user_by_identity_id(identity_id)
    existing_username = str(getattr(existing, "username", "") or "").strip()
    if existing_username:
        return existing_username

    base_candidate = normalize_username(
        preferred_username or email.split("@", 1)[0] or identity_id
    )
    collision = await service.get_user_by_username(base_candidate)
    if not collision or getattr(collision, "id", None) == identity_id:
        return base_candidate

    suffix = identity_id.replace("-", "")[:8] or "mirror"
    trimmed = base_candidate[: max(3, 50 - len(suffix) - 1)]
    return f"{trimmed}-{suffix}"
