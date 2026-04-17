"""Animation IR to Manim compiler."""

from __future__ import annotations

import json

from services.artifact_generator.animation_ir import AnimationPlan

from .actions import _build_action
from .common import _is_light_hex, _safe_color, _safe_str
from .layout import _fix_overlapping_positions
from .objects import _build_object


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
    lines.append(
        "                core = Circle(radius=0.22, color=icon_color, fill_opacity=0.95, stroke_width=2)"
    )
    lines.append(
        "                rays = VGroup(*[Line(UP * 0.28, UP * 0.46, color=icon_color, stroke_width=2).rotate(i * PI / 4) for i in range(8)])"
    )
    lines.append("                return VGroup(core, rays)")
    lines.append("            if name == 'leaf':")
    lines.append(
        "                leaf = Ellipse(width=0.72, height=0.42, color=icon_color, fill_opacity=0.88, stroke_width=2)"
    )
    lines.append(
        "                vein = Line(LEFT * 0.22, RIGHT * 0.2, color=WHITE, stroke_width=2).rotate(-PI / 8)"
    )
    lines.append("                return VGroup(leaf, vein)")
    lines.append("            if name in ('cell', 'atom', 'molecule'):")
    lines.append(
        "                core = Circle(radius=0.2, color=icon_color, fill_opacity=0.9, stroke_width=2)"
    )
    lines.append(
        "                ring = Circle(radius=0.34, color=icon_color, fill_opacity=0.0, stroke_width=2)"
    )
    lines.append(
        "                p1 = Dot(point=RIGHT * 0.34, color=icon_color, radius=0.05)"
    )
    lines.append(
        "                p2 = Dot(point=LEFT * 0.34, color=icon_color, radius=0.05)"
    )
    lines.append("                return VGroup(core, ring, p1, p2)")
    lines.append("            if name == 'server':")
    lines.append(
        "                rack1 = RoundedRectangle(width=0.62, height=0.16, corner_radius=0.03, color=icon_color, fill_opacity=0.9, stroke_width=2).shift(UP * 0.18)"
    )
    lines.append(
        "                rack2 = RoundedRectangle(width=0.62, height=0.16, corner_radius=0.03, color=icon_color, fill_opacity=0.9, stroke_width=2)"
    )
    lines.append(
        "                rack3 = RoundedRectangle(width=0.62, height=0.16, corner_radius=0.03, color=icon_color, fill_opacity=0.9, stroke_width=2).shift(DOWN * 0.18)"
    )
    lines.append("                return VGroup(rack1, rack2, rack3)")
    lines.append("            if name == 'router':")
    lines.append(
        "                base = RoundedRectangle(width=0.66, height=0.2, corner_radius=0.05, color=icon_color, fill_opacity=0.9, stroke_width=2)"
    )
    lines.append(
        "                ant_l = Line(LEFT * 0.18 + UP * 0.1, LEFT * 0.28 + UP * 0.28, color=icon_color, stroke_width=2)"
    )
    lines.append(
        "                ant_r = Line(RIGHT * 0.18 + UP * 0.1, RIGHT * 0.28 + UP * 0.28, color=icon_color, stroke_width=2)"
    )
    lines.append("                return VGroup(base, ant_l, ant_r)")
    lines.append("            if name == 'cloud':")
    lines.append(
        "                c1 = Circle(radius=0.17, color=icon_color, fill_opacity=0.9, stroke_width=2).shift(LEFT * 0.14)"
    )
    lines.append(
        "                c2 = Circle(radius=0.2, color=icon_color, fill_opacity=0.9, stroke_width=2).shift(RIGHT * 0.05)"
    )
    lines.append(
        "                c3 = Circle(radius=0.14, color=icon_color, fill_opacity=0.9, stroke_width=2).shift(RIGHT * 0.22 + DOWN * 0.03)"
    )
    lines.append("                return VGroup(c1, c2, c3)")
    lines.append("            if name == 'database':")
    lines.append(
        "                top = Ellipse(width=0.62, height=0.16, color=icon_color, fill_opacity=0.9, stroke_width=2).shift(UP * 0.2)"
    )
    lines.append(
        "                mid = RoundedRectangle(width=0.62, height=0.36, corner_radius=0.03, color=icon_color, fill_opacity=0.65, stroke_width=2)"
    )
    lines.append(
        "                bottom = Ellipse(width=0.62, height=0.16, color=icon_color, fill_opacity=0.9, stroke_width=2).shift(DOWN * 0.2)"
    )
    lines.append("                return VGroup(top, mid, bottom)")
    lines.append("            if name == 'arrow':")
    lines.append(
        "                return Arrow(LEFT * 0.32, RIGHT * 0.32, color=icon_color, buff=0.0, stroke_width=4)"
    )
    lines.append("            if name == 'check':")
    lines.append(
        "                return VGroup(Line(LEFT * 0.24 + DOWN * 0.03, LEFT * 0.06 + DOWN * 0.2, color=icon_color, stroke_width=5), Line(LEFT * 0.06 + DOWN * 0.2, RIGHT * 0.26 + UP * 0.2, color=icon_color, stroke_width=5))"
    )
    lines.append("            if name == 'cross':")
    lines.append(
        "                return VGroup(Line(LEFT * 0.24 + UP * 0.24, RIGHT * 0.24 + DOWN * 0.24, color=icon_color, stroke_width=4), Line(LEFT * 0.24 + DOWN * 0.24, RIGHT * 0.24 + UP * 0.24, color=icon_color, stroke_width=4))"
    )
    lines.append("            if name == 'star':")
    lines.append(
        "                return Star(n=5, outer_radius=0.34, color=icon_color, fill_opacity=0.9, stroke_width=2)"
    )
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

    lines.append(f"        bg = Rectangle(")
    lines.append(f"            width=config.frame_width + 1,")
    lines.append(f"            height=config.frame_height + 1,")
    lines.append(f"            fill_color={json.dumps(bg_colors)},")
    lines.append(f"            fill_opacity=1, stroke_width=0)")
    lines.append(f"        self.add(bg)")
    lines.append(
        f'        aura_left = Circle(radius=1.45, color="{accent_a}", fill_opacity=0.14, stroke_width=0)'
    )
    lines.append(
        f'        aura_right = Circle(radius=1.2, color="{accent_b}", fill_opacity=0.12, stroke_width=0)'
    )
    lines.append("        aura_left.move_to(LEFT * 6.2 + UP * 3.0)")
    lines.append("        aura_right.move_to(RIGHT * 6.0 + DOWN * 2.8)")
    lines.append("        self.add(aura_left, aura_right)")
    lines.append(
        "        self.play(aura_left.animate.shift(RIGHT * 0.4 + DOWN * 0.1), "
        "aura_right.animate.shift(LEFT * 0.35 + UP * 0.12), run_time=0.75)"
    )
    lines.append("")

    # Title
    lines.append(
        f'        title = Text("{_safe_str(meta.title)}", font_size=54, weight=BOLD, color="{title_color}", font=base_font)'
    )
    lines.append(f"        title.to_edge(UP, buff=0.52)")
    lines.append(f"        self.play(Write(title), run_time=0.6)")
    if meta.subtitle:
        lines.append(
            f'        subtitle = Text("{_safe_str(meta.subtitle)}", font_size=30, color="{subtitle_color}", font=base_font)'
        )
        lines.append(f"        subtitle.next_to(title, DOWN, buff=0.2)")
        lines.append(
            f"        self.play(FadeIn(subtitle, shift=UP * 0.2), run_time=0.4)"
        )
    lines.append(f"        self.wait(0.3)")
    lines.append("")

    # Create all objects
    for obj in plan.objects:
        obj_lines = _build_object(obj.model_dump())
        lines.extend(obj_lines)
    lines.append("")

    # Execute timeline
    for step in plan.timeline:
        lines.append(f"        # {step.description}")
        for action in step.actions:
            action_lines = _build_action(action.model_dump(), objects)
            lines.extend(action_lines)
        if step.wait_after > 0:
            lines.append(f"        self.wait({step.wait_after})")
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
            lines.append(f"        {tb.id}.to_edge({edge}, buff=0.5)")
        else:
            lines.append(f"        {tb.id}.move_to(ORIGIN)")
        if tb.offset != [0, 0]:
            lines.append(
                f"        {tb.id}.shift(RIGHT * {tb.offset[0]} + UP * {tb.offset[1]})"
            )
        lines.append(
            f"        self.play(FadeIn({tb.id}, shift=UP * 0.2), run_time=0.5)"
        )
        lines.append(f"        self.wait(1)")

    return "\n".join(lines)


def compile_animation_plan_from_json(plan_json: str | dict) -> str:
    """Parse JSON into AnimationPlan, then compile to Manim code."""
    if isinstance(plan_json, str):
        plan_dict = json.loads(plan_json)
    else:
        plan_dict = plan_json
    plan = AnimationPlan.model_validate(plan_dict)
    return compile_animation_plan(plan)
