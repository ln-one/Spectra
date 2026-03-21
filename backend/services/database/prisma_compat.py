from __future__ import annotations

from typing import Any


def _is_select_not_supported(exc: Exception) -> bool:
    return isinstance(exc, TypeError) and "select" in str(exc)


async def find_many_with_select_fallback(
    *,
    model: Any,
    select: dict[str, Any] | None = None,
    **kwargs: Any,
) -> Any:
    query: dict[str, Any] = dict(kwargs)
    if select is not None:
        query["select"] = select

    try:
        return await model.find_many(**query)
    except TypeError as exc:
        if select is None or not _is_select_not_supported(exc):
            raise
        query.pop("select", None)
        return await model.find_many(**query)


async def find_unique_with_select_fallback(
    *,
    model: Any,
    select: dict[str, Any] | None = None,
    **kwargs: Any,
) -> Any:
    query: dict[str, Any] = dict(kwargs)
    if select is not None:
        query["select"] = select

    try:
        return await model.find_unique(**query)
    except TypeError as exc:
        if select is None or not _is_select_not_supported(exc):
            raise
        query.pop("select", None)
        return await model.find_unique(**query)


async def find_first_with_select_fallback(
    *,
    model: Any,
    select: dict[str, Any] | None = None,
    **kwargs: Any,
) -> Any:
    query: dict[str, Any] = dict(kwargs)
    if select is not None:
        query["select"] = select

    try:
        return await model.find_first(**query)
    except TypeError as exc:
        if select is None or not _is_select_not_supported(exc):
            raise
        query.pop("select", None)
        return await model.find_first(**query)
