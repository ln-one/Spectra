from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw


_CANVAS_SIZE = (1280, 720)
_BG = "#eef1f4"
_SURFACE = "#f8fafc"
_INK = "#1f2937"
_MUTED = "#94a3b8"
_ACCENT = "#2563eb"
_SUCCESS = "#0f766e"
_HIGHLIGHT = "#ea580c"


def _draw_algorithm(draw: ImageDraw.ImageDraw) -> None:
    baseline = 540
    left = 250
    widths = 90
    heights = [160, 240, 320, 210, 380]
    accents = [_MUTED, _ACCENT, _MUTED, _HIGHLIGHT, _SUCCESS]
    for index, height in enumerate(heights):
        x0 = left + index * 120
        x1 = x0 + widths
        y0 = baseline - height
        draw.rounded_rectangle((x0, y0, x1, baseline), radius=24, fill=accents[index])


def _draw_physics(draw: ImageDraw.ImageDraw) -> None:
    draw.line((220, 560, 1060, 560), fill=_INK, width=5)
    draw.line((260, 150, 260, 580), fill=_INK, width=5)
    points = [(300, 520), (430, 430), (560, 360), (690, 310), (820, 285), (940, 290)]
    draw.line(points, fill=_ACCENT, width=8, joint="curve")
    for point in points[::2]:
        draw.ellipse((point[0] - 10, point[1] - 10, point[0] + 10, point[1] + 10), fill=_ACCENT)
    draw.ellipse((570, 345, 625, 400), fill=_SUCCESS)
    draw.line((598, 373, 680, 300), fill=_HIGHLIGHT, width=7)
    draw.polygon([(680, 300), (652, 304), (664, 322)], fill=_HIGHLIGHT)


def _draw_system(draw: ImageDraw.ImageDraw) -> None:
    boxes = [
        (180, 220, 360, 320),
        (470, 220, 650, 320),
        (760, 220, 940, 320),
        (470, 420, 650, 520),
    ]
    fills = [_SURFACE, "#dbeafe", "#dcfce7", "#ffedd5"]
    for rect, fill in zip(boxes, fills):
        draw.rounded_rectangle(rect, radius=24, fill=fill, outline=_MUTED, width=3)
    arrows = [
        ((360, 270), (470, 270)),
        ((650, 270), (760, 270)),
        ((560, 320), (560, 420)),
    ]
    for start, end in arrows:
        draw.line((*start, *end), fill=_INK, width=6)
        draw.polygon(
            [
                (end[0], end[1]),
                (end[0] - 18, end[1] - 12),
                (end[0] - 18, end[1] + 12),
            ],
            fill=_INK,
        )


def _draw_math(draw: ImageDraw.ImageDraw) -> None:
    draw.line((220, 560, 1040, 560), fill=_INK, width=5)
    draw.line((320, 120, 320, 600), fill=_INK, width=5)
    curve = [(320, 520), (420, 470), (520, 405), (620, 325), (720, 260), (820, 230), (930, 245)]
    draw.line(curve, fill=_ACCENT, width=8, joint="curve")
    draw.line((620, 325, 760, 180), fill=_HIGHLIGHT, width=6)
    draw.polygon([(760, 180), (734, 188), (750, 206)], fill=_HIGHLIGHT)


def render_animation_first_frame(
    content: dict[str, Any],
    output_path: str,
) -> str:
    image = Image.new("RGB", _CANVAS_SIZE, _BG)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((70, 60, 1210, 660), radius=42, fill=_SURFACE, outline="#cbd5e1", width=3)

    family = str(
        content.get("family_hint")
        or content.get("animation_family")
        or content.get("subject_family")
        or ""
    ).strip()
    if family == "physics_mechanics":
        _draw_physics(draw)
    elif family == "system_flow":
        _draw_system(draw)
    elif family == "math_transform":
        _draw_math(draw)
    else:
        _draw_algorithm(draw)

    target = Path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, format="PNG")
    return str(target)
