"""
Deterministic Compiler: AnimationPlan (IR) -> Manim v0.18.1 Python code.

This compiler translates a validated AnimationPlan JSON into executable Manim
code. All Manim API calls are hardcoded here — the LLM never touches raw
Manim APIs, so API hallucinations are structurally impossible.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from services.artifact_generator.animation_ir import AnimationPlan
from services.artifact_generator.icon_library import resolve_icon_name

logger = logging.getLogger(__name__)

# ============================================================================
# Manim v0.18.1 API whitelist
# ============================================================================

_VALID_COLORS = {
    "WHITE", "BLACK", "GRAY", "GRAY_A", "GRAY_B", "GRAY_C", "GRAY_D", "GRAY_E",
    "RED", "RED_A", "RED_B", "RED_C", "RED_D", "RED_E",
    "ORANGE", "YELLOW", "YELLOW_A", "YELLOW_B", "YELLOW_C", "YELLOW_D", "YELLOW_E",
    "GREEN", "GREEN_A", "GREEN_B", "GREEN_C", "GREEN_D", "GREEN_E", "LIME_GREEN",
    "BLUE", "BLUE_A", "BLUE_B", "BLUE_C", "BLUE_D", "BLUE_E", "DARK_BLUE",
    "PURPLE", "PURPLE_A", "PURPLE_B", "PURPLE_C", "PURPLE_D", "PURPLE_E",
    "TEAL", "TEAL_A", "TEAL_B", "TEAL_C", "TEAL_D", "TEAL_E",
    "MAROON", "GOLD", "PINK",
}

_COLOR_ALIASES = {
    "LIME": "LIME_GREEN", "LIGHT_BLUE": "BLUE_A", "LIGHT_GREEN": "GREEN_A",
    "LIGHT_RED": "RED_A", "PURPLE_LIGHT": "PURPLE_A",
    "GRAY_LIGHT": "GRAY_A", "GRAY_DARK": "GRAY_E",
}


def _safe_color(raw: str) -> str:
    c = raw.strip().upper()
    c = _COLOR_ALIASES.get(c, c)
    return c if c in _VALID_COLORS else "WHITE"


def _safe_id(raw_id: str) -> str:
    """Ensure object ID is a valid Python identifier."""
    import re
    # Replace non-alphanumeric/underscore with underscore
    cleaned = re.sub(r'[^a-zA-Z0-9_]', '_', raw_id)
    # Prefix with 'obj_' if starts with digit
    if cleaned and cleaned[0].isdigit():
        cleaned = 'obj_' + cleaned
    return cleaned or 'obj_unknown'


def _safe_str(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int] | None:
    raw = str(hex_color or "").strip().lstrip("#")
    if len(raw) != 6:
        return None
    try:
        return int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)
    except ValueError:
        return None


def _is_light_hex(hex_color: str) -> bool:
    rgb = _hex_to_rgb(hex_color)
    if not rgb:
        return False
    r, g, b = rgb
    # Perceived luminance
    luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return luminance >= 150


# ============================================================================
# Object builders — each type maps to exactly one Manim constructor
# ============================================================================

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
            f'        {oid}_rect = RoundedRectangle('
            f'width={w}, height={h}, corner_radius={corner_radius}, '
            f'color={color}, fill_opacity={fill_opacity}, stroke_width={stroke_width})'
        )
        if label:
            lines.append(
                f'        {oid}_label = Text("{_safe_str(label)}", font_size=32, color="#1a1a1a", font=base_font)'
            )
            lines.append(f'        {oid}_label.move_to({oid}_rect)')
            lines.append(f'        {oid} = VGroup({oid}_rect, {oid}_label)')
        else:
            lines.append(f'        {oid} = {oid}_rect')
        lines.append(f'        {oid}.move_to(RIGHT * {pos[0]} + UP * {pos[1]})')

    elif otype == "circle":
        r = size.get("radius", 0.5)
        lines.append(
            f'        {oid} = Circle(radius={r}, color={color}, '
            f'fill_opacity={fill_opacity}, stroke_width={stroke_width})'
        )
        if label:
            lines.append(
                f'        {oid}_label = Text("{_safe_str(label)}", font_size=24, color="#1a1a1a", font=base_font)'
            )
            lines.append(f'        {oid}_label.move_to({oid})')
            lines.append(f'        {oid} = VGroup({oid}, {oid}_label)')
        lines.append(f'        {oid}.move_to(RIGHT * {pos[0]} + UP * {pos[1]})')

    elif otype == "dot":
        r = size.get("radius", 0.12)
        lines.append(f'        {oid} = Dot(color={color}, radius={r})')
        lines.append(f'        {oid}.move_to(RIGHT * {pos[0]} + UP * {pos[1]})')

    elif otype == "text":
        fs = style.get("font_size", 30)
        lines.append(
            f'        {oid} = Text("{_safe_str(label or "")}", font_size={fs}, color={color}, font=base_font)'
        )
        lines.append(f'        {oid}.move_to(RIGHT * {pos[0]} + UP * {pos[1]})')

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
        lines.append(f'        {oid}_icon.set_color({color})')
        lines.append(f'        {oid}_icon.scale({scale})')
        if label:
            lines.append(
                f'        {oid}_label = Text("{_safe_str(label)}", font_size=22, color="#1a1a1a", font=base_font)'
            )
            lines.append(f'        {oid}_label.next_to({oid}_icon, DOWN, buff=0.16)')
            lines.append(f'        {oid} = VGroup({oid}_icon, {oid}_label)')
        else:
            lines.append(f'        {oid} = {oid}_icon')
        lines.append(f'        {oid}.move_to(RIGHT * {pos[0]} + UP * {pos[1]})')

    elif otype == "arrow":
        start = style.get("start", [pos[0] - 1, pos[1]])
        end = style.get("end", [pos[0] + 1, pos[1]])
        # Ensure start != end (Manim crashes on zero-length arrows)
        if abs(start[0] - end[0]) < 0.1 and abs(start[1] - end[1]) < 0.1:
            end = [start[0] + 1.5, start[1]]
        lines.append(
            f'        {oid} = Arrow('
            f'start=RIGHT * {start[0]} + UP * {start[1]}, '
            f'end=RIGHT * {end[0]} + UP * {end[1]}, '
            f'color={color}, buff=0.15, stroke_width={stroke_width})'
        )

    return lines


# ============================================================================
# Action builders — each action type maps to exactly one Manim animation
# ============================================================================

def _build_action(action: dict, all_objects: dict[str, bool]) -> list[str]:
    """Return lines of Manim code for one animation action."""
    atype = action["type"]
    targets = action.get("target", [])
    if isinstance(targets, str):
        targets = [targets]
    # Sanitize target IDs
    targets = [_safe_id(t) for t in targets]
    params = action.get("params", {})
    lag_ratio = action.get("lag_ratio")
    run_time = params.get("run_time", 0.6)
    shift = params.get("shift")

    # Filter to only existing objects (check original IDs)
    valid_targets = []
    for orig_t, safe_t in zip(action.get("target", []) if isinstance(action.get("target"), list) else [action.get("target", "")], targets):
        if orig_t in all_objects:
            valid_targets.append(safe_t)
    targets = valid_targets
    if not targets:
        return []

    lines: list[str] = []

    if atype == "fade_in":
        shift_str = f", shift=RIGHT * {shift[0]} + UP * {shift[1]}" if shift else ""
        if len(targets) == 1:
            lines.append(f'        self.play(FadeIn({targets[0]}{shift_str}), run_time={run_time})')
        elif lag_ratio:
            anims = ", ".join(f'FadeIn({t}{shift_str})' for t in targets)
            lines.append(f'        self.play(LaggedStart({anims}, lag_ratio={lag_ratio}), run_time={run_time})')
        else:
            anims = ", ".join(f'FadeIn({t}{shift_str})' for t in targets)
            lines.append(f'        self.play({anims}, run_time={run_time})')

    elif atype == "fade_out":
        if len(targets) == 1:
            lines.append(f'        self.play(FadeOut({targets[0]}), run_time={run_time})')
        else:
            anims = ", ".join(f'FadeOut({t})' for t in targets)
            lines.append(f'        self.play({anims}, run_time={run_time})')

    elif atype == "create":
        for t in targets:
            lines.append(f'        self.play(Create({t}), run_time={run_time})')

    elif atype == "write":
        for t in targets:
            lines.append(f'        self.play(Write({t}), run_time={run_time})')

    elif atype == "grow_arrow":
        for t in targets:
            lines.append(f'        self.play(GrowArrow({t}), run_time={run_time})')

    elif atype == "move_to":
        dest = params.get("destination", [0, 0])
        for t in targets:
            lines.append(
                f'        self.play({t}.animate.move_to(RIGHT * {dest[0]} + UP * {dest[1]}), '
                f'run_time={run_time})'
            )

    elif atype == "highlight":
        # Ability matrix: highlight only works on box/circle (has fill)
        # For text/dot/arrow, degrade to Indicate
        opacity = params.get("opacity", 0.7)
        for t in targets:
            obj = all_objects.get(t) or all_objects.get(
                next((k for k in all_objects if _safe_id(k) == t), ""), None
            )
            obj_type = obj.type if obj else "box"
            if obj_type in ("text", "dot", "arrow"):
                # Degrade: text/dot/arrow can't set_fill, use Indicate instead
                color = _safe_color(params.get("color", "YELLOW"))
                lines.append(f'        self.play(Indicate({t}, color={color}), run_time={run_time})')
            else:
                # box/circle: safe to set_fill
                lines.append(
                    f'        {t}_ht = {t}[0] if isinstance({t}, VGroup) else {t}'
                )
                lines.append(
                    f'        self.play({t}_ht.animate.set_fill(opacity={opacity}), run_time={run_time})'
                )

    elif atype == "indicate":
        color = _safe_color(params.get("color", "YELLOW"))
        for t in targets:
            lines.append(f'        self.play(Indicate({t}, color={color}), run_time={run_time})')

    elif atype == "flash":
        color = _safe_color(params.get("color", "YELLOW"))
        for t in targets:
            lines.append(f'        self.play(Flash({t}, color={color}, flash_radius=0.5))')

    elif atype == "transform":
        new_text = params.get("new_text", "")
        color = _safe_color(params.get("color", "WHITE"))
        fs = params.get("font_size", 24)
        for t in targets:
            # Use unique temp var to avoid variable shadowing
            tmp = f"_tmp_{t}"
            lines.append(
                f'        {tmp} = Text("{_safe_str(new_text)}", font_size={fs}, color={color}, font=base_font)'
            )
            lines.append(f'        {tmp}.move_to({t})')
            lines.append(
                f'        self.play(ReplacementTransform({t}, {tmp}), run_time={run_time})'
            )

    return lines


# ============================================================================
# Main compiler
# ============================================================================

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


def compile_animation_plan(plan: AnimationPlan) -> str:
    """Compile AnimationPlan (IR) into executable Manim v0.18.1 Python code."""
    meta = plan.scene_meta
    objects = {obj.id: obj for obj in plan.objects}

    # Auto-fix overlapping positions
    _fix_overlapping_positions(plan.objects)

    lines: list[str] = []
    lines.append("from manim import *")
    lines.append("")
    lines.append("class GeneratedScene(Scene):")
    lines.append("    def construct(self):")
    lines.append("        def _build_icon_mobject(icon_name: str, icon_color):")
    lines.append("            name = (icon_name or 'star').strip().lower()")
    lines.append("            if name == 'sun':")
    lines.append("                core = Circle(radius=0.22, color=icon_color, fill_opacity=0.95, stroke_width=2)")
    lines.append("                rays = VGroup(*[Line(UP * 0.28, UP * 0.46, color=icon_color, stroke_width=2).rotate(i * PI / 4) for i in range(8)])")
    lines.append("                return VGroup(core, rays)")
    lines.append("            if name == 'leaf':")
    lines.append("                leaf = Ellipse(width=0.72, height=0.42, color=icon_color, fill_opacity=0.88, stroke_width=2)")
    lines.append("                vein = Line(LEFT * 0.22, RIGHT * 0.2, color=WHITE, stroke_width=2).rotate(-PI / 8)")
    lines.append("                return VGroup(leaf, vein)")
    lines.append("            if name in ('cell', 'atom', 'molecule'):")
    lines.append("                core = Circle(radius=0.2, color=icon_color, fill_opacity=0.9, stroke_width=2)")
    lines.append("                ring = Circle(radius=0.34, color=icon_color, fill_opacity=0.0, stroke_width=2)")
    lines.append("                p1 = Dot(point=RIGHT * 0.34, color=icon_color, radius=0.05)")
    lines.append("                p2 = Dot(point=LEFT * 0.34, color=icon_color, radius=0.05)")
    lines.append("                return VGroup(core, ring, p1, p2)")
    lines.append("            if name == 'server':")
    lines.append("                rack1 = RoundedRectangle(width=0.62, height=0.16, corner_radius=0.03, color=icon_color, fill_opacity=0.9, stroke_width=2).shift(UP * 0.18)")
    lines.append("                rack2 = RoundedRectangle(width=0.62, height=0.16, corner_radius=0.03, color=icon_color, fill_opacity=0.9, stroke_width=2)")
    lines.append("                rack3 = RoundedRectangle(width=0.62, height=0.16, corner_radius=0.03, color=icon_color, fill_opacity=0.9, stroke_width=2).shift(DOWN * 0.18)")
    lines.append("                return VGroup(rack1, rack2, rack3)")
    lines.append("            if name == 'router':")
    lines.append("                base = RoundedRectangle(width=0.66, height=0.2, corner_radius=0.05, color=icon_color, fill_opacity=0.9, stroke_width=2)")
    lines.append("                ant_l = Line(LEFT * 0.18 + UP * 0.1, LEFT * 0.28 + UP * 0.28, color=icon_color, stroke_width=2)")
    lines.append("                ant_r = Line(RIGHT * 0.18 + UP * 0.1, RIGHT * 0.28 + UP * 0.28, color=icon_color, stroke_width=2)")
    lines.append("                return VGroup(base, ant_l, ant_r)")
    lines.append("            if name == 'cloud':")
    lines.append("                c1 = Circle(radius=0.17, color=icon_color, fill_opacity=0.9, stroke_width=2).shift(LEFT * 0.14)")
    lines.append("                c2 = Circle(radius=0.2, color=icon_color, fill_opacity=0.9, stroke_width=2).shift(RIGHT * 0.05)")
    lines.append("                c3 = Circle(radius=0.14, color=icon_color, fill_opacity=0.9, stroke_width=2).shift(RIGHT * 0.22 + DOWN * 0.03)")
    lines.append("                return VGroup(c1, c2, c3)")
    lines.append("            if name == 'database':")
    lines.append("                top = Ellipse(width=0.62, height=0.16, color=icon_color, fill_opacity=0.9, stroke_width=2).shift(UP * 0.2)")
    lines.append("                mid = RoundedRectangle(width=0.62, height=0.36, corner_radius=0.03, color=icon_color, fill_opacity=0.65, stroke_width=2)")
    lines.append("                bottom = Ellipse(width=0.62, height=0.16, color=icon_color, fill_opacity=0.9, stroke_width=2).shift(DOWN * 0.2)")
    lines.append("                return VGroup(top, mid, bottom)")
    lines.append("            if name == 'arrow':")
    lines.append("                return Arrow(LEFT * 0.32, RIGHT * 0.32, color=icon_color, buff=0.0, stroke_width=4)")
    lines.append("            if name == 'check':")
    lines.append("                return VGroup(Line(LEFT * 0.24 + DOWN * 0.03, LEFT * 0.06 + DOWN * 0.2, color=icon_color, stroke_width=5), Line(LEFT * 0.06 + DOWN * 0.2, RIGHT * 0.26 + UP * 0.2, color=icon_color, stroke_width=5))")
    lines.append("            if name == 'cross':")
    lines.append("                return VGroup(Line(LEFT * 0.24 + UP * 0.24, RIGHT * 0.24 + DOWN * 0.24, color=icon_color, stroke_width=4), Line(LEFT * 0.24 + DOWN * 0.24, RIGHT * 0.24 + UP * 0.24, color=icon_color, stroke_width=4))")
    lines.append("            if name == 'star':")
    lines.append("                return Star(n=5, outer_radius=0.34, color=icon_color, fill_opacity=0.9, stroke_width=2)")
    lines.append("            return Dot(color=icon_color, radius=0.16)")
    lines.append('        base_font = "Noto Sans CJK SC"')
    lines.append("        Text.set_default(font=base_font)")

    # Background
    bg_colors = meta.background_gradient
    if not bg_colors:
        bg_colors = ["#f3fbff", "#d8ecfb"]
    is_light_theme = _is_light_hex(bg_colors[0])
    title_color = "#0b3a5e" if is_light_theme else "WHITE"
    subtitle_color = "#0e7490" if is_light_theme else "GRAY_A"
    # Label color for objects: dark on light background, light on dark background
    label_color = "#1a1a1a" if is_light_theme else "WHITE"
    accent_a = "#93d8ff" if is_light_theme else "#3b82f6"
    accent_b = "#7dd3c8" if is_light_theme else "#10b981"

    lines.append(f'        bg = Rectangle(')
    lines.append(f'            width=config.frame_width + 1,')
    lines.append(f'            height=config.frame_height + 1,')
    lines.append(f'            fill_color={json.dumps(bg_colors)},')
    lines.append(f'            fill_opacity=1, stroke_width=0)')
    lines.append(f'        self.add(bg)')
    lines.append(
        f'        aura_left = Circle(radius=1.45, color="{accent_a}", fill_opacity=0.14, stroke_width=0)'
    )
    lines.append(
        f'        aura_right = Circle(radius=1.2, color="{accent_b}", fill_opacity=0.12, stroke_width=0)'
    )
    lines.append('        aura_left.move_to(LEFT * 6.2 + UP * 3.0)')
    lines.append('        aura_right.move_to(RIGHT * 6.0 + DOWN * 2.8)')
    lines.append('        self.add(aura_left, aura_right)')
    lines.append(
        '        self.play(aura_left.animate.shift(RIGHT * 0.4 + DOWN * 0.1), '
        'aura_right.animate.shift(LEFT * 0.35 + UP * 0.12), run_time=0.75)'
    )
    lines.append("")

    # Title
    lines.append(
        f'        title = Text("{_safe_str(meta.title)}", font_size=54, weight=BOLD, color="{title_color}", font=base_font)'
    )
    lines.append(f'        title.to_edge(UP, buff=0.52)')
    lines.append(f'        self.play(Write(title), run_time=0.6)')
    if meta.subtitle:
        lines.append(
            f'        subtitle = Text("{_safe_str(meta.subtitle)}", font_size=30, color="{subtitle_color}", font=base_font)'
        )
        lines.append(f'        subtitle.next_to(title, DOWN, buff=0.2)')
        lines.append(f'        self.play(FadeIn(subtitle, shift=UP * 0.2), run_time=0.4)')
    lines.append(f'        self.wait(0.3)')
    lines.append("")

    # Create all objects
    for obj in plan.objects:
        obj_lines = _build_object(obj.model_dump())
        lines.extend(obj_lines)
    lines.append("")

    # Execute timeline
    for step in plan.timeline:
        lines.append(f'        # {step.description}')
        for action in step.actions:
            action_lines = _build_action(action.model_dump(), objects)
            lines.extend(action_lines)
        if step.wait_after > 0:
            lines.append(f'        self.wait({step.wait_after})')
        lines.append("")

    # Text blocks
    for tb in plan.text_blocks:
        color = _safe_color(tb.color)
        lines.append(
            f'        {tb.id} = Text("{_safe_str(tb.content)}", font_size={tb.font_size}, color={color}, font=base_font)'
        )
        pos_map = {"top": "UP", "bottom": "DOWN", "left": "LEFT", "right": "RIGHT"}
        edge = pos_map.get(tb.position)
        if edge:
            lines.append(f'        {tb.id}.to_edge({edge}, buff=0.5)')
        else:
            lines.append(f'        {tb.id}.move_to(ORIGIN)')
        if tb.offset != [0, 0]:
            lines.append(f'        {tb.id}.shift(RIGHT * {tb.offset[0]} + UP * {tb.offset[1]})')
        lines.append(f'        self.play(FadeIn({tb.id}, shift=UP * 0.2), run_time=0.5)')
        lines.append(f'        self.wait(1)')

    return "\n".join(lines)


def compile_animation_plan_from_json(plan_json: str | dict) -> str:
    """Parse JSON into AnimationPlan, then compile to Manim code."""
    if isinstance(plan_json, str):
        plan_dict = json.loads(plan_json)
    else:
        plan_dict = plan_json
    plan = AnimationPlan.model_validate(plan_dict)
    return compile_animation_plan(plan)


# ============================================================================
# Preflight checks — validate AnimationPlan before compilation
# ============================================================================

def preflight_check(plan: AnimationPlan) -> list[str]:
    """
    Run static checks on AnimationPlan before compilation.
    Auto-repairs common issues, returns remaining errors.
    """
    errors = []
    object_ids = {obj.id for obj in plan.objects}

    # Auto-repair: drop invalid targets, downgrade risky actions
    for step in plan.timeline:
        sanitized_actions = []
        for action in step.actions:
            raw_targets = action.target if isinstance(action.target, list) else [action.target]
            valid_targets = [t for t in raw_targets if t in object_ids]
            if not valid_targets:
                continue  # Drop action with no valid targets

            # Downgrade risky actions
            if action.type == "transform":
                new_text = action.params.get("new_text") if action.params else None
                if not new_text:
                    action.type = "indicate"  # Safe fallback
                    action.params = {"color": "YELLOW"}
            elif action.type in ("move_to", "highlight", "flash"):
                # These actions are error-prone, downgrade to indicate
                action.type = "indicate"
                action.params = {"color": "YELLOW"}

            action.target = valid_targets[0] if len(valid_targets) == 1 else valid_targets
            sanitized_actions.append(action)
        step.actions = sanitized_actions

    # After auto-repair, only check for issues we can't fix
    # (All object reference issues should be fixed above, so skip Check 1)

    # Check 2: Arrow objects must have valid start/end or position
    for obj in plan.objects:
        if obj.type == "arrow":
            style = obj.style or {}
            start = style.get("start")
            end = style.get("end")
            pos = obj.position if isinstance(obj.position, list) else [0, 0]

            # If no explicit start/end, check position is valid
            if not start and not end:
                if not isinstance(pos, list) or len(pos) != 2:
                    errors.append(
                        f"object '{obj.id}': arrow has invalid position {pos}"
                    )
            # If explicit start/end, check they're different
            elif start and end:
                if abs(start[0] - end[0]) < 0.1 and abs(start[1] - end[1]) < 0.1:
                    errors.append(
                        f"object '{obj.id}': arrow start {start} and end {end} are too close"
                    )

    # Check 3 & 4 removed: move_to and transform are now auto-repaired above
    return errors
