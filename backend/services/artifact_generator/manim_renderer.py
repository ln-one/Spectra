"""Manim renderer client + LLM code generation.

Flow:
  1. `generate_manim_code_with_llm(spec)` -> Manim Python code string
  2. `render_manim_gif(code, scene_name)` -> call manim-renderer service -> GIF bytes
  3. `render_gif_via_manim(content, storage_path)` -> public entry point used by `media.py`

The LLM generates Manim code using a few-shot prompt that includes several
reference examples covering common teaching animation patterns.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
_MANIM_RENDERER_BASE_URL = os.getenv(
    "MANIM_RENDERER_BASE_URL", "http://manim-renderer:8120"
)
_MANIM_RENDERER_TIMEOUT = float(os.getenv("MANIM_RENDERER_TIMEOUT_SECONDS", "150"))
_MANIM_RENDERER_ENABLED = os.getenv("MANIM_RENDERER_ENABLED", "false").lower() == "true"
_MANIM_RENDER_QUALITY = str(os.getenv("MANIM_RENDER_QUALITY", "m")).strip() or "m"
_MANIM_RENDER_FPS = int(os.getenv("MANIM_RENDER_FPS", "24"))
_MAX_REPAIR_ATTEMPTS = 0  # 当前无 LLM Python repair，仅主渲染一次


# ---------------------------------------------------------------------------
# Few-Shot examples for Manim code generation
# ---------------------------------------------------------------------------

_FEWSHOT_EXAMPLES = """
=== 示例 1：流程型动画（process_flow / pipeline_sequence）===
主题：编译器的四个阶段
- 深色渐变背景
- 4 个流程卡片横向排布
- 箭头串联各阶段
- 每一步用 `Indicate` 强调当前阶段
- 结尾用底部总结文本收束

=== 示例 2：双端交互（protocol_exchange）===
主题：HTTP 请求与响应
- 左右两端分别是客户端和服务端
- 请求箭头从左到右，响应箭头从右到左
- 每次消息发送时高亮当前发送方
- 结尾总结“请求-响应循环完成”

=== 示例 3：结构分层（structure_breakdown）===
主题：TCP/IP 五层模型
- 5 层卡片纵向堆叠
- 逐层高亮并显示右侧说明
- 结尾用一句总结文本收束
"""

_SYSTEM_PROMPT = """\
你是一名 Manim 动画专家，专门为中学和大学课堂生成高质量教学动画代码。
你只输出完整、可直接执行的 Manim Python 代码，不输出任何解释、注释或代码块标记。
所有文字内容使用中文，字体用系统默认（不要指定 font 参数，除非必要）。

【视觉风格要求】
- 背景：使用深色渐变背景（如 #0a0e27 到 #1a1e3a），不要纯黑色
- 卡片/容器：使用 RoundedRectangle，corner_radius=0.15-0.25，带渐变填充
- 配色方案：使用现代感强的配色（TEAL/BLUE 系、GREEN 系、PURPLE 系），避免纯色
- 动画节奏：多用镜头切换（FadeOut 旧元素 + FadeIn 新元素），避免所有元素堆在一个画面
- 强调效果：重点内容用 Indicate、Circumscribe、Flash 等突出
- 过渡动画：场景切换时用 LaggedStart 制造层次感

【可用动画类白名单】只能使用以下动画类，禁止使用任何不在此列表中的动画类：
- 出现/消失：Write, FadeIn, FadeOut, GrowFromCenter, GrowArrow, Create, Uncreate, DrawBorderThenFill
- 变换：Transform, ReplacementTransform, TransformFromCopy, MoveToTarget, Indicate, Circumscribe
- 移动：MoveAlongPath, ApplyMethod
- 组合：LaggedStart, AnimationGroup, Succession
- 其他：Wait, Flash, ShowPassingFlash
- animate 链式调用：obj.animate.move_to(...), obj.animate.shift(...), obj.animate.scale(...), obj.animate.set_fill(...), obj.animate.set_color(...), obj.animate.become(...)

禁止使用：GrowCorner, GrowFromEdge, SpinInFromNothing, RollIn, 或任何其他未在白名单中的动画类。

【可用颜色常量白名单】只能使用以下颜色，禁止使用任何不在此列表中的颜色名：
WHITE, BLACK, GRAY, GRAY_A, GRAY_B, GRAY_C, GRAY_D, GRAY_E,
RED, RED_A, RED_B, RED_C, RED_D, RED_E,
ORANGE, YELLOW, YELLOW_A, YELLOW_B, YELLOW_C, YELLOW_D, YELLOW_E,
GREEN, GREEN_A, GREEN_B, GREEN_C, GREEN_D, GREEN_E, LIME_GREEN,
BLUE, BLUE_A, BLUE_B, BLUE_C, BLUE_D, BLUE_E, DARK_BLUE,
PURPLE, PURPLE_A, PURPLE_B, PURPLE_C, PURPLE_D, PURPLE_E,
TEAL, TEAL_A, TEAL_B, TEAL_C, TEAL_D, TEAL_E,
MAROON, GOLD, PINK
禁止使用：LIME, LIGHT_BLUE, LIGHT_GREEN, PURPLE_LIGHT, GRAY_LIGHT 等不在白名单中的颜色。
"""

_USER_PROMPT_TEMPLATE = """\
请根据以下教学分镜脚本，生成一段完整的 Manim 动画 Python 代码。

【教学主题】{topic}
【核心表现重点】{focus}
【动画类型】{visual_type}
【主题分类】{subject_family}
【教学目标】{teaching_goal}
【场景列表】
{scenes_text}
【动画对象】
{objects_text}
【时长约束】约 {duration_seconds} 秒

---
代码要求：
1. Scene 类名必须是 `GeneratedScene`
2. 从 `from manim import *` 开始
3. 所有动画内容必须与教学主题直接相关，禁止使用与主题无关的装饰性元素
4. 按场景列表的顺序依次演示，每个场景对应一段动画逻辑
5. 使用 `self.wait()` 控制节奏，总时长控制在 {duration_seconds} 秒左右
6. 动画对象（如节点、方块、箭头）的标签文字必须使用场景中的真实内容，不能用"步骤1""元素A"等通用占位符
7. 结尾展示一句总结文字
8. 只输出 Python 代码，不加任何说明文字
9. **禁止在 Text() 中使用 HTML 标签（如 <br>、<b>、<i> 等），换行请用 \\n**
10. **Text() 不支持富文本，所有文字必须是纯文本字符串**
11. **VGroup() 只能包含 Mobject 对象（如 Text、Circle、Rectangle 等），不能直接放字符串或数字**
12. **所有文字必须先用 Text() 包装成 Mobject，再加入 VGroup 或传给 self.play()**
13. **Text() 的 font= 参数只能传字符串字体名（如 font="sans-serif"），禁止使用未定义的常量（如 URBAN_BOLD、BOLD_FONT 等）**
14. **corner_radius 参数只有 RoundedRectangle 支持，Rectangle/Circle/Square 等不支持，禁止传入**
15. **获取画布尺寸用 config.frame_width 和 config.frame_height，不要用 FRAME_WIDTH/FRAME_HEIGHT（未导出）**

参考风格示例：
{fewshot}

现在请为上述主题生成代码：
"""

_REPAIR_PROMPT_TEMPLATE = """\
以下 Manim 代码执行时报错，请只输出修复后的完整代码，不加任何解释。

【出错位置】
{error_context}

【完整错误信息】
{error}

修复规则（严格遵守）：
- 只修复出错的那几行，保持其余代码不变
- 禁止使用 HTML 标签，换行用 \\n
- 只能用白名单动画类：Write, FadeIn, FadeOut, GrowFromCenter, GrowArrow, Create, Transform, ReplacementTransform, LaggedStart, AnimationGroup, Indicate, Flash, obj.animate.xxx
- 只能用白名单颜色：WHITE, BLACK, GRAY, RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE, TEAL, MAROON, GOLD, PINK 及 _A/_B/_C/_D/_E 变体
- set_fill() 参数是 opacity=，不是 fill_opacity=
- Text() 不支持 font= 常量，只支持 font="字体名字符串"
- VGroup() 只能包含 Mobject 对象，不能放字符串

【完整原始代码】
{code}
"""


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


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------


def _format_scenes(scenes: list[dict]) -> str:
    lines = []
    for i, s in enumerate(scenes, 1):
        lines.append(
            f"  场景{i}【{s.get('title', '')}】：{s.get('description', '')} "
            f"（重点：{s.get('emphasis', '')}）"
        )
    return "\n".join(lines)


def _format_objects(objects: list[dict]) -> str:
    if not objects:
        return "  （无指定对象）"
    lines = []
    for obj in objects:
        lines.append(f"  - {obj.get('label', '')}（{obj.get('role', '')}）")
    return "\n".join(lines)


def _build_generation_prompt(spec: dict[str, Any]) -> tuple[str, str]:
    scenes = spec.get("scenes") or []
    objects = spec.get("object_details") or spec.get("objects") or []
    if isinstance(objects[0], str) if objects else False:
        objects = [{"label": o} for o in objects]

    user_prompt = _USER_PROMPT_TEMPLATE.format(
        topic=spec.get("topic") or spec.get("title") or "教学主题",
        focus=spec.get("focus") or "",
        visual_type=spec.get("visual_type") or "process_flow",
        subject_family=spec.get("subject_family") or "generic_process",
        teaching_goal=spec.get("teaching_goal") or spec.get("focus") or "",
        scenes_text=_format_scenes(scenes),
        objects_text=_format_objects(objects),
        duration_seconds=spec.get("duration_seconds") or 8,
        fewshot=_FEWSHOT_EXAMPLES,
    )
    return _SYSTEM_PROMPT, user_prompt


def _build_repair_prompt(code: str, error: str) -> tuple[str, str]:
    error_context = _extract_error_context(code, error)
    user_prompt = _REPAIR_PROMPT_TEMPLATE.format(
        code=code, error=error[-1200:], error_context=error_context
    )
    return _SYSTEM_PROMPT, user_prompt


# ---------------------------------------------------------------------------
# LLM call
# ---------------------------------------------------------------------------


async def _call_llm(
    system_prompt: str, user_prompt: str, max_tokens: int = 2400
) -> str:
    from services.ai import _resolve_model_name, acompletion

    raw_model = (
        os.getenv("MANIM_LLM_MODEL")
        or os.getenv("SMALL_MODEL")
        or os.getenv("LARGE_MODEL")
        or os.getenv("DEFAULT_MODEL")
        or "qwen3.5-flash"
    )
    model = _resolve_model_name(raw_model)
    timeout = float(os.getenv("AI_REQUEST_TIMEOUT_SECONDS", "90"))
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    response = await asyncio.wait_for(
        acompletion(model=model, messages=messages, max_tokens=max_tokens),
        timeout=timeout,
    )
    content = response.choices[0].message.content or ""
    if isinstance(content, list):
        content = " ".join(
            item.get("text", "") for item in content if isinstance(item, dict)
        )
    return str(content).strip()


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


import ast as _ast
import json as _json

from services.artifact_generator.animation_compiler import (
    compile_animation_plan_from_json,
    preflight_check,
)
from services.artifact_generator.animation_ir import AnimationPlan


def _check_syntax(code: str) -> str | None:
    """Return error message if code has syntax errors, else None."""
    try:
        _ast.parse(code)
        return None
    except SyntaxError as exc:
        return f"SyntaxError at line {exc.lineno}: {exc.msg}"


async def generate_manim_code(spec: dict[str, Any]) -> str:
    """
    Generate Manim code via IR-First approach.
    Falls back to deterministic safe template on failure — NOT legacy LLM code.
    """
    try:
        code = await _generate_via_ir(spec)
        if code:
            return code
    except Exception as e:
        logger.warning("IR generation failed (%s), using deterministic fallback", e)

    # Deterministic fallback — always succeeds, no LLM involved
    return _build_safe_fallback_code(spec)


async def _generate_via_ir(spec: dict[str, Any]) -> str:
    """Generate Manim code via IR (AnimationPlan JSON -> compiler).

    Strategy:
    1. Try template-based generation first (stable, multi-shot)
    2. Fall back to free LLM generation if no template matches
    """
    from services.artifact_generator.animation_template_dispatcher import (
        select_template,
        fill_template_slots,
    )
    from services.artifact_generator.animation_compiler import (
        compile_animation_plan_from_json,
    )

    topic = spec.get("topic", "")
    theme = spec.get("theme") or {}
    bg = theme.get("background", "#f3fbff")
    panel = theme.get("panel", "#ffffff")

    # Step 1: Try template-based generation
    match = await select_template(spec, _call_llm)
    if match:
        template_name, template_fn = match
        logger.info(
            "generate_manim_code[template]: topic=%s template=%s", topic, template_name
        )
        try:
            slots = await fill_template_slots(template_name, spec, _call_llm)
            template_result = template_fn(slots)

            plan_json = {
                "scene_meta": {
                    "title": topic,
                    "subtitle": spec.get("focus", ""),
                    "duration_seconds": spec.get("duration_seconds", 8),
                    "background_gradient": [bg, panel],
                },
                "objects": template_result["objects"],
                "timeline": template_result["timeline"],
                "text_blocks": [],
            }
            plan_json = _align_timeline_with_scenes(plan_json, spec)

            code = compile_animation_plan_from_json(plan_json)
            logger.info("generate_manim_code[template]: code_length=%d", len(code))
            return code
        except Exception as e:
            logger.warning(
                "Template generation failed (%s), falling back to free LLM", e
            )

    # Step 2: Free LLM generation
    system_prompt, user_prompt = _build_ir_prompt(spec)

    for attempt in range(2):
        raw = await _call_llm(system_prompt, user_prompt, max_tokens=3000)

        try:
            # Extract JSON from LLM response
            plan_json = _extract_json(raw)
            plan_json = _align_timeline_with_scenes(plan_json, spec)
            plan = AnimationPlan.model_validate(plan_json)

            # Preflight check: validate plan before compilation
            errors = preflight_check(plan)
            if errors:
                error_msg = f"AnimationPlan validation failed: {'; '.join(errors[:3])}"
                logger.warning(
                    "generate_manim_code[IR]: preflight failed, errors=%s", errors
                )
                if attempt < 1:
                    # Retry with error feedback
                    user_prompt = f"""{user_prompt}

【上次生成的 JSON 有以下问题，请修复】
{chr(10).join(f'- {e}' for e in errors[:5])}

请重新输出修复后的完整 AnimationPlan JSON："""
                    continue
                raise ValueError(error_msg)

            # Compile IR -> Manim code
            code = compile_animation_plan_from_json(plan_json)
            logger.info(
                "generate_manim_code[IR]: topic=%s code_length=%d attempt=%d",
                spec.get("topic"),
                len(code),
                attempt,
            )
            return code

        except (_json.JSONDecodeError, Exception) as e:
            logger.warning("generate_manim_code[IR]: attempt %d failed: %s", attempt, e)
            if attempt < 1:
                # Retry with error feedback
                user_prompt = f"""{user_prompt}

【上次生成失败，错误信息】
{str(e)[:300]}

请重新输出正确的 AnimationPlan JSON："""
                continue
            raise


async def _generate_legacy(spec: dict[str, Any]) -> str:
    """Legacy: LLM generates Manim Python code directly."""
    system_prompt, user_prompt = _build_generation_prompt(spec)
    raw = await _call_llm(system_prompt, user_prompt, max_tokens=2400)
    code = _sanitize_manim_code(_extract_python_code(raw))
    syntax_error = _check_syntax(code)
    if syntax_error:
        logger.warning(
            "generate_manim_code[legacy]: syntax error, repairing: %s", syntax_error
        )
        code = _sanitize_manim_code(
            _extract_python_code(
                await _call_llm(
                    *_build_repair_prompt(code, syntax_error), max_tokens=2400
                )
            )
        )
    logger.info(
        "generate_manim_code[legacy]: topic=%s code_length=%d",
        spec.get("topic"),
        len(code),
    )
    return code


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


def _align_timeline_with_scenes(
    plan_json: dict[str, Any], spec: dict[str, Any]
) -> dict[str, Any]:
    """Ensure scene cards map to timeline steps (at least 1 step per scene)."""
    theme = spec.get("theme") or {}
    bg = str(theme.get("background") or "#f3fbff")
    panel = str(theme.get("panel") or "#ffffff")
    duration_seconds = int(spec.get("duration_seconds") or 8)

    scene_meta = plan_json.get("scene_meta")
    if not isinstance(scene_meta, dict):
        scene_meta = {}
    scene_meta["duration_seconds"] = duration_seconds
    scene_meta["background_gradient"] = [bg, panel]
    plan_json["scene_meta"] = scene_meta

    scenes = spec.get("scenes") or []

    timeline = plan_json.get("timeline")
    if not isinstance(timeline, list):
        timeline = []
    objects = plan_json.get("objects")
    if not isinstance(objects, list):
        objects = []

    object_ids = [
        str(obj.get("id")) for obj in objects if isinstance(obj, dict) and obj.get("id")
    ]

    has_scenes = isinstance(scenes, list) and len(scenes) > 0
    min_steps_by_duration = max(3, min(6, round(duration_seconds / 2.8)))
    target_steps = max(len(scenes) if has_scenes else 0, min_steps_by_duration)

    # Align existing step descriptions with scene cards (if available).
    if has_scenes:
        for i in range(min(len(timeline), len(scenes))):
            step = timeline[i]
            if not isinstance(step, dict):
                continue
            step["description"] = _scene_step_description(scenes[i], i)
            step["wait_after"] = float(step.get("wait_after") or 0.4)

    # If timeline is too short, append deterministic focus steps.
    if len(timeline) < target_steps:
        fallback_target = object_ids[0] if object_ids else None
        for i in range(len(timeline), target_steps):
            target = object_ids[i % len(object_ids)] if object_ids else fallback_target
            actions = []
            if i == 0 and object_ids:
                actions.append(
                    {
                        "type": "fade_in",
                        "target": object_ids[: min(2, len(object_ids))],
                        "params": {"run_time": 0.5},
                    }
                )
            if target:
                actions.append(
                    {
                        "type": "indicate",
                        "target": target,
                        "params": {"color": "YELLOW", "run_time": 0.6},
                    }
                )
            if not target and object_ids:
                actions.append(
                    {
                        "type": "fade_in",
                        "target": object_ids[: min(2, len(object_ids))],
                        "params": {"run_time": 0.5},
                    }
                )
            timeline.append(
                {
                    "description": (
                        _scene_step_description(scenes[i], i)
                        if has_scenes and i < len(scenes)
                        else f"镜头 {i + 1}"
                    ),
                    "actions": actions,
                    "wait_after": 0.45,
                }
            )

    # Guarantee each step has visible shot change, avoid "single static camera".
    entrance_types = {"fade_in", "create", "write", "grow_arrow"}
    for i, step in enumerate(timeline):
        if not isinstance(step, dict):
            continue
        actions = step.get("actions")
        if not isinstance(actions, list):
            actions = []
            step["actions"] = actions
        has_entrance = any(
            isinstance(a, dict) and a.get("type") in entrance_types for a in actions
        )
        if has_entrance:
            continue
        if object_ids:
            curr_target = object_ids[i % len(object_ids)]
            if i > 0:
                prev_target = object_ids[(i - 1) % len(object_ids)]
                actions.insert(
                    0,
                    {
                        "type": "fade_out",
                        "target": prev_target,
                        "params": {"run_time": 0.28},
                    },
                )
            actions.insert(
                1 if i > 0 else 0,
                {
                    "type": "fade_in",
                    "target": curr_target,
                    "params": {"run_time": 0.42, "shift": [0.22, 0]},
                },
            )
        step["wait_after"] = float(step.get("wait_after") or 0.4)

    # Stretch/compact waits so playback duration is closer to requested seconds.
    total_wait = sum(float((s or {}).get("wait_after") or 0.4) for s in timeline)
    target_wait = max(duration_seconds - 2.5, len(timeline) * 0.4)
    if timeline and total_wait > 0:
        scale = max(0.75, min(2.8, target_wait / total_wait))
        for step in timeline:
            if not isinstance(step, dict):
                continue
            adjusted = float(step.get("wait_after") or 0.4) * scale
            step["wait_after"] = round(max(0.3, min(1.8, adjusted)), 2)

    plan_json["timeline"] = timeline
    return plan_json


def _build_ir_prompt(spec: dict[str, Any]) -> tuple[str, str]:
    """Build prompt that asks LLM to generate AnimationPlan JSON."""
    scenes = spec.get("scenes") or []
    objects = spec.get("object_details") or spec.get("objects") or []
    theme = spec.get("theme") or {}

    # Extract theme colors for prompt
    bg_gradient = theme.get("background", "#f3fbff")
    panel_color = theme.get("panel", "#ffffff")
    accent_color = theme.get("accent", "#2f6da5")

    # Build background gradient suggestion
    bg_suggestion = f'["{bg_gradient}", "{panel_color}"]'

    system_prompt = """\
你是一名动画设计专家。你只输出 AnimationPlan JSON，不输出解释。
AnimationPlan 结构：
{
  "scene_meta": {"title": "标题", "subtitle": "副标题", "duration_seconds": 8, "background_gradient": ["#0a0e27", "#1a1e3a"]},
  "objects": [{"id": "唯一ID", "type": "box|circle|dot|text|arrow|icon", "name": "icon名称", "label": "标签", "color": "颜色", "position": [-4, 0], "size": {"width": 2.5, "height": 1.5}, "style": {"fill_opacity": 0.3, "corner_radius": 0.2}}],
  "timeline": [{"description": "描述", "actions": [{"type": "动画类型", "target": "对象ID", "params": {}, "lag_ratio": 0.2}], "wait_after": 0.3}],
  "text_blocks": [{"id": "ID", "content": "文字", "position": "bottom", "color": "WHITE", "font_size": 26, "offset": [0, 0]}]
}

重要规则：
- objects 的 position 必须是数字数组 [x, y]
- text_blocks 的 position 可以是 top/bottom/left/right/center
- 可用 type: box, circle, dot, text, arrow, icon
- icon 对象必须提供 name 字段
- 可用 icon name: sun, leaf, cell, molecule, atom, server, router, cloud, database, arrow, check, cross, star
- icon 的 size 可以是数字缩放值，例如 1.2
- 可用动画: fade_in, fade_out, create, indicate
- 严格禁止使用: transform, move_to, highlight, flash
- 所有对象必须先在 objects 中定义，不能在 timeline 中引用不存在的对象
- 可用颜色: WHITE, BLACK, GRAY, GRAY_A, RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE, TEAL, MAROON, GOLD, PINK 及其 _A/_B/_C/_D/_E 变体

示例 1 - TCP 三次握手：
{
  "scene_meta": {"title": "TCP 三次握手", "subtitle": "建立连接的三个步骤", "duration_seconds": 8, "background_gradient": ["#f3fbff", "#d8ecfb"]},
  "objects": [
    {"id": "client", "type": "box", "label": "客户端", "color": "BLUE_C", "position": [-4, 0], "size": {"width": 2.5, "height": 1.5}, "style": {"fill_opacity": 0.2, "corner_radius": 0.2}},
    {"id": "server", "type": "box", "label": "服务器", "color": "GREEN_C", "position": [4, 0], "size": {"width": 2.5, "height": 1.5}, "style": {"fill_opacity": 0.2, "corner_radius": 0.2}},
    {"id": "arrow1", "type": "arrow", "label": "", "color": "TEAL", "position": [0, 1], "style": {"start": [-2.5, 0.5], "end": [2.5, 0.5]}},
    {"id": "arrow2", "type": "arrow", "label": "", "color": "ORANGE", "position": [0, 0], "style": {"start": [2.5, 0], "end": [-2.5, 0]}},
    {"id": "arrow3", "type": "arrow", "label": "", "color": "PURPLE", "position": [0, -1], "style": {"start": [-2.5, -0.5], "end": [2.5, -0.5]}}
  ]
}
"""

    scenes_text = "\n".join(
        f"  场景{i+1}【{s.get('title', '')}】：{s.get('description', '')}（重点：{s.get('emphasis', '')}）"
        for i, s in enumerate(scenes)
    )
    objects_text = (
        "\n".join(
            f"  - {(obj.get('label') or obj) if isinstance(obj, dict) else obj}"
            for obj in objects
        )
        or "  （无指定对象）"
    )

    user_prompt = f"""\\
请为以下教学主题设计 AnimationPlan JSON：
【主题】{spec.get('topic') or spec.get('title') or '教学主题'}
【重点】{spec.get('focus') or ''}
【类型】{spec.get('visual_type') or 'process_flow'}
【目标】{spec.get('teaching_goal') or ''}
【场景】
{scenes_text}
【对象】
{objects_text}
【时长】约 {spec.get('duration_seconds') or 8} 秒
【视觉主题配色】背景渐变必须使用 {bg_suggestion}，强调色优先使用 {accent_color}

设计要求：
1. background_gradient 必须使用指定配色 {bg_suggestion}
2. 文本字号偏大：title >= 50，节点标签 >= 30，说明文字 >= 28
3. box 类型优先使用圆角卡片风格
4. 尽量使用镜头切换和 indicate 强调重点
5. 所有标签必须使用中文
6. 对象标签必须具体，禁止 A/B/C 这类占位符
7. position 必须合理分布，避免对象重叠
8. 对象颜色优先使用深色或高饱和颜色
9. timeline 应分场景渐进展开

只输出 JSON。
"""

    return system_prompt, user_prompt


async def repair_manim_code(code: str, error: str) -> str:
    """Ask LLM to fix broken Manim code given the error message."""
    system_prompt, user_prompt = _build_repair_prompt(code, error)
    raw = await _call_llm(system_prompt, user_prompt, max_tokens=2400)
    return _sanitize_manim_code(_extract_python_code(raw))


# ---------------------------------------------------------------------------
# HTTP client: call manim-renderer service
# ---------------------------------------------------------------------------


async def _call_renderer(
    code: str,
    scene_name: str = "GeneratedScene",
    output_format: str = "gif",
    quality: str = _MANIM_RENDER_QUALITY,
    fps: int = _MANIM_RENDER_FPS,
) -> bytes:
    """POST to manim-renderer service and return raw file bytes."""
    url = f"{_MANIM_RENDERER_BASE_URL.rstrip('/')}/render"
    payload = {
        "code": code,
        "scene_name": scene_name,
        "output_format": output_format,
        "quality": quality,
        "fps": fps,
    }
    async with httpx.AsyncClient(timeout=_MANIM_RENDERER_TIMEOUT) as client:
        response = await client.post(url, json=payload)

    if response.status_code == 400:
        raise ValueError(f"Renderer rejected code: {response.text[:400]}")
    if response.status_code != 200:
        raise RuntimeError(
            f"Renderer error {response.status_code}: {response.text[:400]}"
        )
    return response.content


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def should_use_manim_renderer(content: dict[str, Any]) -> bool:
    """Return True if the Manim renderer should be used for this request."""
    render_mode = str(content.get("render_mode") or "").strip().lower()
    # Explicit opt-in should always take effect.
    if render_mode == "manim":
        return True
    # cloud_video_wan goes to Aliyun, never Manim.
    if render_mode == "cloud_video_wan":
        return False
    # Auto mode: when enabled, intercept all GIF requests.
    if _MANIM_RENDERER_ENABLED:
        return True
    return False


async def render_gif_via_manim(
    content: dict[str, Any],
    storage_path: str,
) -> str:
    """Generate a GIF using Manim, with one automatic LLM repair attempt on failure.

    Returns the path to the saved GIF file.
    Falls back silently by raising RuntimeError so the caller can use the
    legacy SVG renderer instead.
    """
    from services.artifact_generator.animation_spec import normalize_animation_spec

    spec = normalize_animation_spec(content)

    # Step 1: Generate Manim code via LLM
    code = await generate_manim_code(spec)
    if not code:
        raise RuntimeError("LLM returned empty Manim code")

    # Step 2: Try rendering (single attempt, no LLM repair)
    render_error: str | None = None
    try:
        gif_bytes = await _call_renderer(
            code=code,
            scene_name="GeneratedScene",
            output_format="gif",
            quality=_MANIM_RENDER_QUALITY,
            fps=_MANIM_RENDER_FPS,
        )
        # Success: write to storage path
        path = Path(storage_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(gif_bytes)
        logger.info(
            "render_gif_via_manim: saved gif size=%d path=%s",
            len(gif_bytes),
            storage_path,
        )
        return str(path)

    except (ValueError, RuntimeError) as exc:
        render_error = str(exc)
        logger.warning("render_gif_via_manim: rendering failed: %s", render_error)

    # Step 3: Deterministic fallback inside Manim path (avoid dropping to SVG)
    logger.warning(
        "render_gif_via_manim: LLM code failed after %d attempt(s), "
        "trying deterministic fallback scene",
        _MAX_REPAIR_ATTEMPTS + 1,
    )
    fallback_code = _build_safe_fallback_code(spec)
    try:
        gif_bytes = await _call_renderer(
            code=fallback_code,
            scene_name="GeneratedScene",
            output_format="gif",
            quality=_MANIM_RENDER_QUALITY,
            fps=_MANIM_RENDER_FPS,
        )
        path = Path(storage_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(gif_bytes)
        logger.info(
            "render_gif_via_manim: deterministic fallback saved gif size=%d path=%s",
            len(gif_bytes),
            storage_path,
        )
        return str(path)
    except Exception as fallback_exc:
        raise RuntimeError(
            f"Manim render failed after {_MAX_REPAIR_ATTEMPTS + 1} attempt(s). "
            f"Last error: {render_error}; fallback_error: {fallback_exc}"
        ) from fallback_exc
