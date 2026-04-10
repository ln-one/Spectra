from __future__ import annotations

from typing import Any


class _ProjectedRecord(dict):
    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError as exc:  # pragma: no cover - defensive
            raise AttributeError(name) from exc


def _owner_id(session: Any) -> str | None:
    return session.get("userId") if isinstance(session, dict) else session.userId


def _read_field(record: Any, field_name: str) -> Any:
    if isinstance(record, dict):
        return record.get(field_name)
    return getattr(record, field_name, None)


def _project_value(value: Any, selector: Any) -> Any:
    if isinstance(selector, dict):
        if value is None:
            return None
        if isinstance(value, list):
            return [_project_record(item, selector) for item in value]
        return _project_record(value, selector)
    return value


def _project_record(record: Any, select: dict[str, Any]) -> _ProjectedRecord:
    projected = _ProjectedRecord()
    for field_name, selector in select.items():
        if not selector:
            continue
        projected[field_name] = _project_value(
            _read_field(record, field_name),
            selector,
        )
    return projected


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
    session = await db.generationsession.find_unique(**lookup)
    if session is None:
        raise ValueError(f"Session not found: {session_id}")
    if _owner_id(session) != user_id:
        raise PermissionError("无权访问该会话")
    if select is not None:
        return _project_record(session, select)
    return session
