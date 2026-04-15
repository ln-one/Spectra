"""Manim action code builders."""

from __future__ import annotations

from .common import _safe_color, _safe_id, _safe_str


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
    for orig_t, safe_t in zip(
        (
            action.get("target", [])
            if isinstance(action.get("target"), list)
            else [action.get("target", "")]
        ),
        targets,
    ):
        if orig_t in all_objects:
            valid_targets.append(safe_t)
    targets = valid_targets
    if not targets:
        return []

    lines: list[str] = []

    if atype == "fade_in":
        shift_str = f", shift=RIGHT * {shift[0]} + UP * {shift[1]}" if shift else ""
        if len(targets) == 1:
            lines.append(
                f"        self.play(FadeIn({targets[0]}{shift_str}), run_time={run_time})"
            )
        elif lag_ratio:
            anims = ", ".join(f"FadeIn({t}{shift_str})" for t in targets)
            lines.append(
                f"        self.play(LaggedStart({anims}, lag_ratio={lag_ratio}), run_time={run_time})"
            )
        else:
            anims = ", ".join(f"FadeIn({t}{shift_str})" for t in targets)
            lines.append(f"        self.play({anims}, run_time={run_time})")

    elif atype == "fade_out":
        if len(targets) == 1:
            lines.append(
                f"        self.play(FadeOut({targets[0]}), run_time={run_time})"
            )
        else:
            anims = ", ".join(f"FadeOut({t})" for t in targets)
            lines.append(f"        self.play({anims}, run_time={run_time})")

    elif atype == "create":
        for t in targets:
            lines.append(f"        self.play(Create({t}), run_time={run_time})")

    elif atype == "write":
        for t in targets:
            lines.append(f"        self.play(Write({t}), run_time={run_time})")

    elif atype == "grow_arrow":
        for t in targets:
            lines.append(f"        self.play(GrowArrow({t}), run_time={run_time})")

    elif atype == "move_to":
        dest = params.get("destination", [0, 0])
        for t in targets:
            lines.append(
                f"        self.play({t}.animate.move_to(RIGHT * {dest[0]} + UP * {dest[1]}), "
                f"run_time={run_time})"
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
                lines.append(
                    f"        self.play(Indicate({t}, color={color}), run_time={run_time})"
                )
            else:
                # box/circle: safe to set_fill
                lines.append(
                    f"        {t}_ht = {t}[0] if isinstance({t}, VGroup) else {t}"
                )
                lines.append(
                    f"        self.play({t}_ht.animate.set_fill(opacity={opacity}), run_time={run_time})"
                )

    elif atype == "indicate":
        color = _safe_color(params.get("color", "YELLOW"))
        for t in targets:
            lines.append(
                f"        self.play(Indicate({t}, color={color}), run_time={run_time})"
            )

    elif atype == "flash":
        color = _safe_color(params.get("color", "YELLOW"))
        for t in targets:
            lines.append(
                f"        self.play(Flash({t}, color={color}, flash_radius=0.5))"
            )

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
            lines.append(f"        {tmp}.move_to({t})")
            lines.append(
                f"        self.play(ReplacementTransform({t}, {tmp}), run_time={run_time})"
            )

    return lines
