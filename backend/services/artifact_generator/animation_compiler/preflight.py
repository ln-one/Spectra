"""Preflight validation and safe IR repair."""

from __future__ import annotations

from services.artifact_generator.animation_ir import AnimationPlan


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
            raw_targets = (
                action.target if isinstance(action.target, list) else [action.target]
            )
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

            action.target = (
                valid_targets[0] if len(valid_targets) == 1 else valid_targets
            )
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
