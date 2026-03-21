from __future__ import annotations

from typing import Any


def _owner_id(session: Any) -> str | None:
    return session.get("userId") if isinstance(session, dict) else session.userId


async def get_owned_session(
    *,
    db,
    session_id: str,
    user_id: str,
    include: dict[str, Any] | None = None,
    select: dict[str, Any] | None = None,
):
    lookup: dict[str, Any] = {"where": {"id": session_id}}
    if include is not None:
        lookup["include"] = include
    if select is not None:
        lookup["select"] = select

    try:
        session = await db.generationsession.find_unique(**lookup)
    except TypeError as exc:
        # Prisma Python client compatibility:
        # some generated clients do not support `select` for find_unique.
        if select is not None and "select" in str(exc):
            lookup.pop("select", None)
            session = await db.generationsession.find_unique(**lookup)
        else:
            raise
    if session is None:
        raise ValueError(f"Session not found: {session_id}")
    if _owner_id(session) != user_id:
        raise PermissionError("无权访问该会话")
    return session
