from __future__ import annotations

from typing import Awaitable, Callable


async def handle_regenerate_slide(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event: Callable[..., Awaitable[None]],
    conflict_error_cls,
) -> dict:
    del db, session, command, new_state, append_event
    message = "课件单页修改旧链路已下线，仅支持 Diego 生成主链路。"
    details = {"reason": "legacy_courseware_modify_removed"}
    try:
        raise conflict_error_cls(
            message,
            error_code="RESOURCE_CONFLICT",
            details=details,
        )
    except TypeError:
        exc = conflict_error_cls(message)
        setattr(exc, "error_code", "RESOURCE_CONFLICT")
        setattr(exc, "details", details)
        raise exc

