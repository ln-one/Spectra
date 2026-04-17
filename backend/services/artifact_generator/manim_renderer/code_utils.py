"""Manim code sanitizing and extraction helpers."""

from __future__ import annotations

import ast as _ast
import json as _json
import re
from typing import Any


def _extract_error_context(code: str, error: str) -> str:
    """Extract the lines around the error location from the error message."""
    import re

    # Try to find line number from error message
    match = re.search(r"scene\.py[:\s]+line\s+(\d+)|scene\.py:(\d+)", error)
    if not match:
        match = re.search(r"❱\s+(\d+)", error)
    if not match:
        return f"（无法定位具体行号）\n错误：{error[:300]}"

    line_no = int(match.group(1) or match.group(2))
    lines = code.split("\n")
    start = max(0, line_no - 4)
    end = min(len(lines), line_no + 3)
    context_lines = []
    for i, line in enumerate(lines[start:end], start=start + 1):
        marker = ">>> " if i == line_no else "    "
        context_lines.append(f"{marker}{i:3d}: {line}")
    return "\n".join(context_lines)


def _extract_python_code(raw: str) -> str:
    """Strip markdown fences and return clean Python code."""
    # Remove ```python ... ``` or ``` ... ```
    cleaned = re.sub(r"```(?:python)?", "", raw).strip()
    cleaned = cleaned.rstrip("`").strip()
    return cleaned


def _sanitize_manim_code(code: str) -> str:
    """Fix common LLM hallucinations that cause Manim runtime errors."""
    # Ensure Chinese text can render even when LLM omits font=...
    if 'Text.set_default(font="Noto Sans CJK SC")' not in code:
        code = re.sub(
            r"from manim import \*\n",
            'from manim import *\nText.set_default(font="Noto Sans CJK SC")\n',
            code,
            count=1,
        )
    # Replace <br> / <br/> inside strings with \n
    code = re.sub(r"<br\s*/?>", r"\\n", code)
    # Remove markup=True/False argument (Text() doesn't support it in v0.18)
    code = re.sub(r",?\s*markup\s*=\s*(True|False)", "", code)
    # Remove set_tex_format calls (not a real Manim method)
    code = re.sub(r"\s*\w+\.set_tex_format\([^)]*\)\n?", "\n", code)
    # Remove free_copy_of_text calls (not a real Manim method)
    code = re.sub(r"\s*self\.free_copy_of_text\([^)]*\)\n?", "\n", code)
    # Remove hallucinated font= keyword arguments in Text()
    # e.g. font=URBAN_BOLD, font=BOLD_FONT etc.
    code = re.sub(r",?\s*font\s*=\s*[A-Z_][A-Z_0-9]*(?=[,\)])", "", code)
    # Replace hallucinated animation classes with correct ones
    code = re.sub(r"\bGrowCorner\b", "GrowFromCenter", code)
    code = re.sub(r"\bGrowFromEdge\b", "GrowFromCenter", code)
    code = re.sub(r"\bSpinInFromNothing\b", "FadeIn", code)
    code = re.sub(r"\bRollIn\b", "FadeIn", code)
    code = re.sub(r"\bSlideIn\b", "FadeIn", code)
    # Replace hallucinated color constants with valid Manim colors
    code = re.sub(r"\bLIME\b", "LIME_GREEN", code)
    code = re.sub(r"\bPURPLE_LIGHT\b", "PURPLE_A", code)
    code = re.sub(r"\bLIGHT_BLUE\b", "BLUE_A", code)
    code = re.sub(r"\bLIGHT_GREEN\b", "GREEN_A", code)
    code = re.sub(r"\bLIGHT_RED\b", "RED_A", code)
    code = re.sub(r"\bDARK_BLUE\b", "DARK_BLUE", code)
    code = re.sub(r"\bGRAY_LIGHT\b", "GRAY_A", code)
    code = re.sub(r"\bGRAY_DARK\b", "GRAY_E", code)
    # Remove corner_radius from shapes that don't support it
    # Only RoundedRectangle supports corner_radius
    # Step 1: temporarily protect RoundedRectangle's corner_radius
    code = re.sub(
        r"(RoundedRectangle\([^)]*?),?\s*corner_radius\s*=\s*([\d.]+)",
        r"\1,__CR__=\2",
        code,
    )
    # Step 2: remove all remaining corner_radius
    code = re.sub(r",?\s*corner_radius\s*=\s*[\d.]+", "", code)
    # Step 3: restore RoundedRectangle's corner_radius
    code = re.sub(r",__CR__=([\d.]+)", r", corner_radius=\1", code)
    # Remove hallucinated Arrow/shape parameters
    code = re.sub(r",?\s*width_to_tip_len_ratio\s*=\s*[^,\)\n]+", "", code)
    code = re.sub(r",?\s*tip_length\s*=\s*[^,\)\n]+", "", code)
    code = re.sub(r",?\s*tip_width_ratio\s*=\s*[^,\)\n]+", "", code)
    # Replace FRAME_WIDTH/FRAME_HEIGHT with config.frame_width/height
    code = re.sub(r"\bFRAME_WIDTH\b", "config.frame_width", code)
    code = re.sub(r"\bFRAME_HEIGHT\b", "config.frame_height", code)
    # Fix set_fill(fill_opacity=...) -> set_fill(opacity=...)
    code = re.sub(
        r"\.set_fill\(([^)]*?)fill_opacity\s*=", r".set_fill(\1opacity=", code
    )
    # Fix set_stroke(stroke_opacity=...) -> set_stroke(opacity=...)
    code = re.sub(
        r"\.set_stroke\(([^)]*?)stroke_opacity\s*=", r".set_stroke(\1opacity=", code
    )
    # Wrap bare string literals inside VGroup(...) with Text()
    # e.g. VGroup(rect, "label") -> VGroup(rect, Text("label"))
    code = re.sub(
        r"VGroup\(([^)]+)\)",
        lambda m: "VGroup("
        + re.sub(r'(?<![=\w])"([^"]+)"', r'Text("\1")', m.group(1))
        + ")",
        code,
    )
    return code


def _safe_text(value: Any, default: str = "") -> str:
    text = str(value or default)
    text = text.replace("\\", "\\\\").replace('"', '\\"')
    text = text.replace("\r\n", "\\n").replace("\n", "\\n")
    return text


def _build_safe_fallback_code(spec: dict[str, Any]) -> str:
    """Build a deterministic Manim scene that is guaranteed to use stable APIs."""
    topic = _safe_text(spec.get("topic") or spec.get("title"), "教学动画")
    scenes = spec.get("scenes") or []
    scene_lines: list[str] = []
    for item in scenes[:4]:
        title = _safe_text(item.get("title"), "")
        desc = _safe_text(item.get("description"), "")
        if title and desc:
            scene_lines.append(f"{title}: {desc}")
        elif title:
            scene_lines.append(title)
        elif desc:
            scene_lines.append(desc)
    if not scene_lines:
        focus = _safe_text(spec.get("focus"), "核心流程演示")
        scene_lines = [focus]

    body = ",\n            ".join(f'"{line}"' for line in scene_lines)
    return f"""from manim import *

class GeneratedScene(Scene):
    def construct(self):
        base_font = "Noto Sans CJK SC"
        bg = Rectangle(
            width=config.frame_width + 1,
            height=config.frame_height + 1,
            fill_color=["#f3fbff", "#d8ecfb"],
            fill_opacity=1,
            stroke_width=0,
        )
        self.add(bg)

        aura = Circle(radius=1.4, color="#93d8ff", fill_opacity=0.14, stroke_width=0)
        aura.move_to(LEFT * 6 + UP * 3)
        self.add(aura)

        title = Text("{topic}", font_size=54, weight=BOLD, color="#0b3a5e", font=base_font)
        title.to_edge(UP, buff=0.52)
        self.play(Write(title))

        lines = [
            {body}
        ]
        items = VGroup(*[
            Text(f"{{i+1}}. {{line}}", font_size=34, color="#114463", font=base_font)
            for i, line in enumerate(lines)
        ])
        items.arrange(DOWN, aligned_edge=LEFT, buff=0.46)
        items.next_to(title, DOWN, buff=0.72)

        self.play(LaggedStart(*[FadeIn(it, shift=RIGHT * 0.2) for it in items], lag_ratio=0.17))
        self.wait(0.8)
        self.play(Circumscribe(items, color=TEAL))

        summary = Text("动画生成完成", font_size=34, color="#0c8f83", font=base_font)
        summary.to_edge(DOWN, buff=0.5)
        self.play(FadeIn(summary, shift=UP * 0.15))
        self.wait(1.0)
"""


def _check_syntax(code: str) -> str | None:
    """Return error message if code has syntax errors, else None."""
    try:
        _ast.parse(code)
        return None
    except SyntaxError as exc:
        return f"SyntaxError at line {exc.lineno}: {exc.msg}"


def _extract_json(raw: str) -> dict:
    """Extract JSON from LLM response (handles markdown wrapping)."""
    raw = raw.strip()
    if raw.startswith("```json"):
        raw = raw[7:]
    elif raw.startswith("```"):
        raw = raw[3:]
    if raw.endswith("```"):
        raw = raw[:-3]
    raw = raw.strip()
    return _json.loads(raw)


def _scene_step_description(scene: dict[str, Any], index: int) -> str:
    """Build timeline description from scene card."""
    title = str(scene.get("title") or "").strip()
    desc = str(scene.get("description") or "").strip()
    if title and desc:
        return f"{title} - {desc}"[:120]
    if title:
        return title[:120]
    if desc:
        return desc[:120]
    return f"场景{index + 1}演示"
