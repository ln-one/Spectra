"""Manim object code builders."""

from __future__ import annotations

from services.artifact_generator.icon_library import resolve_icon_name

from .common import _safe_color, _safe_id, _safe_str


def _build_object(obj: dict) -> list[str]:
    """Return lines of Manim code that create one visual object."""
    oid = _safe_id(obj["id"])
    otype = obj["type"]
    label = obj.get("label")
    color = _safe_color(obj.get("color", "BLUE"))
    pos = obj.get("position", [0, 0])
    size = obj.get("size") or {}
    style = obj.get("style") or {}
    # Enforce minimum fill_opacity and stroke_width for visual clarity
    fill_opacity = max(style.get("fill_opacity", 0.55), 0.45)
    corner_radius = style.get("corner_radius", 0.2)
    stroke_width = max(style.get("stroke_width", 3), 2.5)

    lines: list[str] = []

    if otype == "box":
        w = size.get("width", 2.5)
        h = size.get("height", 1.5)
        lines.append(
            f"        {oid}_rect = RoundedRectangle("
            f"width={w}, height={h}, corner_radius={corner_radius}, "
            f"color={color}, fill_opacity={fill_opacity}, stroke_width={stroke_width})"
        )
        if label:
            lines.append(
                f'        {oid}_label = Text("{_safe_str(label)}", font_size=32, color="#1a1a1a", font=base_font)'
            )
            lines.append(f"        {oid}_label.move_to({oid}_rect)")
            lines.append(f"        {oid} = VGroup({oid}_rect, {oid}_label)")
        else:
            lines.append(f"        {oid} = {oid}_rect")
        lines.append(f"        {oid}.move_to(RIGHT * {pos[0]} + UP * {pos[1]})")

    elif otype == "circle":
        r = size.get("radius", 0.5)
        lines.append(
            f"        {oid} = Circle(radius={r}, color={color}, "
            f"fill_opacity={fill_opacity}, stroke_width={stroke_width})"
        )
        if label:
            lines.append(
                f'        {oid}_label = Text("{_safe_str(label)}", font_size=24, color="#1a1a1a", font=base_font)'
            )
            lines.append(f"        {oid}_label.move_to({oid})")
            lines.append(f"        {oid} = VGroup({oid}, {oid}_label)")
        lines.append(f"        {oid}.move_to(RIGHT * {pos[0]} + UP * {pos[1]})")

    elif otype == "dot":
        r = size.get("radius", 0.12)
        lines.append(f"        {oid} = Dot(color={color}, radius={r})")
        lines.append(f"        {oid}.move_to(RIGHT * {pos[0]} + UP * {pos[1]})")

    elif otype == "text":
        fs = style.get("font_size", 30)
        lines.append(
            f'        {oid} = Text("{_safe_str(label or "")}", font_size={fs}, color={color}, font=base_font)'
        )
        lines.append(f"        {oid}.move_to(RIGHT * {pos[0]} + UP * {pos[1]})")

    elif otype == "icon":
        icon_name = obj.get("name") or obj.get("icon_id") or label or "star"
        resolved_icon_name = resolve_icon_name(str(icon_name))
        scale = 1.0
        if isinstance(size, (int, float)):
            scale = float(size)
        elif isinstance(size, dict):
            scale = float(size.get("scale", 1.0))
        scale = max(0.2, min(scale, 3.0))
        lines.append(
            f'        {oid}_icon = _build_icon_mobject("{_safe_str(resolved_icon_name)}", {color})'
        )
        lines.append(f"        {oid}_icon.set_color({color})")
        lines.append(f"        {oid}_icon.scale({scale})")
        if label:
            lines.append(
                f'        {oid}_label = Text("{_safe_str(label)}", font_size=22, color="#1a1a1a", font=base_font)'
            )
            lines.append(f"        {oid}_label.next_to({oid}_icon, DOWN, buff=0.16)")
            lines.append(f"        {oid} = VGroup({oid}_icon, {oid}_label)")
        else:
            lines.append(f"        {oid} = {oid}_icon")
        lines.append(f"        {oid}.move_to(RIGHT * {pos[0]} + UP * {pos[1]})")

    elif otype == "arrow":
        start = style.get("start", [pos[0] - 1, pos[1]])
        end = style.get("end", [pos[0] + 1, pos[1]])
        # Ensure start != end (Manim crashes on zero-length arrows)
        if abs(start[0] - end[0]) < 0.1 and abs(start[1] - end[1]) < 0.1:
            end = [start[0] + 1.5, start[1]]
        lines.append(
            f"        {oid} = Arrow("
            f"start=RIGHT * {start[0]} + UP * {start[1]}, "
            f"end=RIGHT * {end[0]} + UP * {end[1]}, "
            f"color={color}, buff=0.15, stroke_width={stroke_width})"
        )

    return lines
