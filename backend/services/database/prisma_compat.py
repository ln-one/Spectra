from __future__ import annotations

from typing import Any


def _is_select_not_supported(exc: Exception) -> bool:
    return isinstance(exc, TypeError) and "select" in str(exc)


async def find_many_with_select_fallback(
    *,
    model: Any,
    where: dict[str, Any] | None = None,
    order: dict[str, Any] | None = None,
    take: int | None = None,
    skip: int | None = None,
    select: dict[str, Any] | None = None,
) -> Any:
    query: dict[str, Any] = {}
    if where is not None:
        query["where"] = where
    if order is not None:
        query["order"] = order
    if take is not None:
        query["take"] = take
    if skip is not None:
        query["skip"] = skip
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
    where: dict[str, Any],
    include: dict[str, Any] | None = None,
    select: dict[str, Any] | None = None,
) -> Any:
    query: dict[str, Any] = {"where": where}
    if include is not None:
        query["include"] = include
    if select is not None:
        query["select"] = select

    try:
        return await model.find_unique(**query)
    except TypeError as exc:
        if select is None or not _is_select_not_supported(exc):
            raise
        query.pop("select", None)
        return await model.find_unique(**query)
