"""Animation plan layout normalization helpers."""

from __future__ import annotations


def _fix_overlapping_positions(objects: list) -> None:
    """Auto-fix overlapping object positions in-place."""
    seen: dict = {}
    for obj in objects:
        if obj.type == "arrow":
            continue
        pos = obj.position if isinstance(obj.position, list) else [0, 0]
        key = (round(pos[0], 1), round(pos[1], 1))
        if key in seen:
            obj.position = [pos[0] + 1.5, pos[1]]
        else:
            seen[key] = obj.id
