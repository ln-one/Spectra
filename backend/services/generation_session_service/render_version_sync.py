from __future__ import annotations

from typing import Any


def coerce_positive_render_version(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value >= 1:
        return value
    if isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
        return parsed if parsed >= 1 else None
    return None


async def set_session_render_version(
    *,
    db,
    session_id: str,
    render_version: object,
) -> Any | None:
    version = coerce_positive_render_version(render_version)
    if version is None:
        return None
    return await db.generationsession.update(
        where={"id": session_id},
        data={"renderVersion": version},
    )
