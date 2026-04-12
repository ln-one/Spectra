"""Manim renderer client + LLM code generation.

Flow:
  1. generate_manim_code_with_llm(spec)  → Manim Python code string
  2. render_manim_gif(code, scene_name)  → calls manim-renderer service → GIF bytes
  3. render_gif_via_manim(content, storage_path)  → public entry point used by media.py

The LLM generates Manim code using a Few-Shot prompt that includes three
reference examples covering the most common teaching animation patterns.
If the first attempt fails (syntax error / runtime error from the renderer),
the error message is fed back to the LLM for one automatic repair attempt.
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
_MANIM_RENDERER_ENABLED = (
    os.getenv("MANIM_RENDERER_ENABLED", "false").lower() == "true"
)
_MANIM_RENDER_QUALITY = str(os.getenv("MANIM_RENDER_QUALITY", "m")).strip() or "m"
_MANIM_RENDER_FPS = int(os.getenv("MANIM_RENDER_FPS", "24"))
_MAX_REPAIR_ATTEMPTS = 2  # 失败后最多尝试 LLM 修复两次


# ---------------------------------------------------------------------------
# Few-Shot examples for Manim code generation
# ---------------------------------------------------------------------------

_FEWSHOT_EXAMPLES = """
=== 示例1：流程步骤（process_flow / pipeline_sequence） ===
主题：编译器的四个阶段

```python
from manim import *

class CompilerPipelineScene(Scene):
    def construct(self):
        # 深色渐变背景
        bg = Rectangle(width=config.frame_width + 1, height=config.frame_height + 1,
                       fill_color=["#0a0e27", "#1a1e3a"], fill_opacity=1, stroke_width=0)
        self.add(bg)

        title = Text("编译器的四个阶段", font_size=42, color=WHITE)
        subtitle = Text("从源代码到可执行程序", font_size=22, color=GRAY_A)
        header = VGroup(title, subtitle).arrange(DOWN, buff=0.2).to_edge(UP, buff=0.6)
        self.play(Write(title), FadeIn(subtitle, shift=UP * 0.2))
        self.wait(0.3)

        stages = ["词法分析", "语法分析", "语义分析", "代码生成"]
        colors = [TEAL, BLUE, PURPLE, GREEN]
        boxes = VGroup()
        for i, (name, color) in enumerate(zip(stages, colors)):
            box = RoundedRectangle(width=2.4, height=1.2, corner_radius=0.2,
                                   color=color, fill_opacity=0.25, stroke_width=2)
            label = Text(name, font_size=24, color=WHITE)
            label.move_to(box)
            group = VGroup(box, label)
            group.shift(RIGHT * (i * 3.0 - 4.5) + DOWN * 0.8)
            boxes.add(group)

        arrows = VGroup()
        for i in range(len(boxes) - 1):
            arr = Arrow(boxes[i].get_right(), boxes[i+1].get_left(),
                        buff=0.15, color=GRAY_B, stroke_width=2)
            arrows.add(arr)

        self.play(LaggedStart(*[FadeIn(b, shift=UP * 0.3) for b in boxes], lag_ratio=0.2))
        self.play(LaggedStart(*[GrowArrow(a) for a in arrows], lag_ratio=0.15))
        self.wait(0.3)

        # 逐步高亮 + 说明文字
        descs = ["将源代码拆分为 Token 序列", "构建抽象语法树 AST",
                 "类型检查与语义验证", "生成目标机器代码"]
        desc_text = None
        for i, box in enumerate(boxes):
            if desc_text:
                self.play(FadeOut(desc_text), run_time=0.2)
            rect = box[0]
            self.play(rect.animate.set_fill(opacity=0.7), Indicate(box, color=colors[i]),
                      run_time=0.6)
            desc_text = Text(descs[i], font_size=20, color=colors[i])
            desc_text.next_to(boxes, DOWN, buff=0.6)
            self.play(FadeIn(desc_text, shift=UP * 0.15))
            self.wait(0.5)
            self.play(rect.animate.set_fill(opacity=0.25), run_time=0.3)

        if desc_text:
            self.play(FadeOut(desc_text))

        summary = Text("四个阶段协同完成编译过程", font_size=28, color=GREEN)
        summary.to_edge(DOWN, buff=0.5)
        self.play(FadeIn(summary, shift=UP * 0.2))
        self.wait(1)
```

=== 示例2：双端交互（protocol_exchange） ===
主题：HTTP 请求响应

```python
from manim import *

class HttpRequestScene(Scene):
    def construct(self):
        bg = Rectangle(width=config.frame_width + 1, height=config.frame_height + 1,
                       fill_color=["#0a1628", "#0d2137"], fill_opacity=1, stroke_width=0)
        self.add(bg)

        title = Text("HTTP 请求与响应", font_size=38, color=WHITE)
        title.to_edge(UP, buff=0.5)
        self.play(Write(title))

        # 客户端和服务器卡片
        client = RoundedRectangle(width=2.8, height=1.6, corner_radius=0.2,
                                  color=TEAL, fill_opacity=0.3, stroke_width=2)
        client_label = Text("浏览器", font_size=28, color=TEAL)
        client_label.move_to(client)
        client_group = VGroup(client, client_label).shift(LEFT * 4 + DOWN * 0.3)

        server = RoundedRectangle(width=2.8, height=1.6, corner_radius=0.2,
                                  color=BLUE, fill_opacity=0.3, stroke_width=2)
        server_label = Text("服务器", font_size=28, color=BLUE)
        server_label.move_to(server)
        server_group = VGroup(server, server_label).shift(RIGHT * 4 + DOWN * 0.3)

        self.play(FadeIn(client_group, shift=RIGHT * 0.3),
                  FadeIn(server_group, shift=LEFT * 0.3))
        self.wait(0.3)

        # 请求报文飞行
        req_dot = Dot(color=YELLOW, radius=0.12)
        req_dot.move_to(client_group.get_right())
        req_label = Text("GET /index.html", font_size=18, color=YELLOW)
        req_label.next_to(req_dot, UP, buff=0.15)
        self.play(FadeIn(req_dot), Write(req_label))
        self.play(
            req_dot.animate.move_to(server_group.get_left()),
            req_label.animate.move_to(server_group.get_left() + UP * 0.4),
            run_time=1.0
        )
        self.play(Flash(server_group, color=BLUE, flash_radius=0.5))
        self.play(FadeOut(req_dot), FadeOut(req_label))

        # 状态码
        state = Text("200 OK", font_size=24, color=GREEN)
        state.next_to(server_group, DOWN, buff=0.3)
        self.play(Write(state))
        self.wait(0.3)

        # 响应报文飞行
        res_dot = Dot(color=GREEN, radius=0.12)
        res_dot.move_to(server_group.get_left())
        res_label = Text("HTML 响应", font_size=18, color=GREEN)
        res_label.next_to(res_dot, UP, buff=0.15)
        self.play(FadeIn(res_dot), Write(res_label))
        self.play(
            res_dot.animate.move_to(client_group.get_right()),
            res_label.animate.move_to(client_group.get_right() + UP * 0.4),
            run_time=1.0
        )
        self.play(Flash(client_group, color=TEAL, flash_radius=0.5))
        self.play(FadeOut(res_dot), FadeOut(res_label), FadeOut(state))

        summary = Text("一次完整的 HTTP 交互完成", font_size=26, color=WHITE)
        summary.to_edge(DOWN, buff=0.5)
        self.play(FadeIn(summary, shift=UP * 0.2))
        self.wait(1)
```

=== 示例3：结构分层（structure_breakdown） ===
主题：TCP/IP 五层模型

```python
from manim import *

class TcpIpLayersScene(Scene):
    def construct(self):
        bg = Rectangle(width=config.frame_width + 1, height=config.frame_height + 1,
                       fill_color=["#0d0d1a", "#1a1a2e"], fill_opacity=1, stroke_width=0)
        self.add(bg)

        title = Text("TCP/IP 五层模型", font_size=40, color=WHITE)
        title.to_edge(UP, buff=0.5)
        self.play(Write(title))

        layers = [
            ("应用层", TEAL, "HTTP、DNS、FTP"),
            ("传输层", BLUE, "TCP、UDP"),
            ("网络层", PURPLE, "IP 寻址与路由"),
            ("数据链路层", ORANGE, "帧传输与 MAC"),
            ("物理层", RED, "比特信号传输"),
        ]
        rects = VGroup()
        for i, (name, color, _) in enumerate(layers):
            rect = RoundedRectangle(width=7, height=0.75, corner_radius=0.15,
                                    color=color, fill_opacity=0.3, stroke_width=2)
            label = Text(name, font_size=24, color=WHITE)
            label.move_to(rect)
            group = VGroup(rect, label)
            group.shift(DOWN * (i * 0.9 - 1.2))
            rects.add(group)

        self.play(LaggedStart(
            *[FadeIn(r, shift=LEFT * 0.5) for r in rects], lag_ratio=0.12
        ))
        self.wait(0.4)

        # 逐层高亮 + 右侧说明
        desc_text = None
        for i, (rect_group, (_, color, desc)) in enumerate(zip(rects, layers)):
            if desc_text:
                self.play(FadeOut(desc_text), run_time=0.2)
            self.play(rect_group[0].animate.set_fill(opacity=0.7),
                      Indicate(rect_group, color=color), run_time=0.5)
            desc_text = Text(desc, font_size=20, color=color)
            desc_text.next_to(rects, RIGHT, buff=0.5).shift(UP * (1.5 - i * 0.7))
            self.play(FadeIn(desc_text, shift=LEFT * 0.2))
            self.wait(0.4)
            self.play(rect_group[0].animate.set_fill(opacity=0.3), run_time=0.2)

        if desc_text:
            self.play(FadeOut(desc_text))

        summary = Text("五层协同完成网络通信", font_size=28, color=TEAL)
        summary.to_edge(DOWN, buff=0.4)
        self.play(FadeIn(summary, shift=UP * 0.2))
        self.wait(1)
```
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
    match = re.search(r'scene\.py[:\s]+line\s+(\d+)|scene\.py:(\d+)', error)
    if not match:
        match = re.search(r'❱\s+(\d+)', error)
    if not match:
        return f"（无法定位具体行号）\n错误：{error[:300]}"

    line_no = int(match.group(1) or match.group(2))
    lines = code.split('\n')
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
        code=code,
        error=error[-1200:],
        error_context=error_context
    )
    return _SYSTEM_PROMPT, user_prompt


# ---------------------------------------------------------------------------
# LLM call
# ---------------------------------------------------------------------------

async def _call_llm(system_prompt: str, user_prompt: str, max_tokens: int = 2400) -> str:
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
    code = re.sub(r'<br\s*/?>', r'\\n', code)
    # Remove markup=True/False argument (Text() doesn't support it in v0.18)
    code = re.sub(r',?\s*markup\s*=\s*(True|False)', '', code)
    # Remove set_tex_format calls (not a real Manim method)
    code = re.sub(r'\s*\w+\.set_tex_format\([^)]*\)\n?', '\n', code)
    # Remove free_copy_of_text calls (not a real Manim method)
    code = re.sub(r'\s*self\.free_copy_of_text\([^)]*\)\n?', '\n', code)
    # Remove hallucinated font= keyword arguments in Text()
    # e.g. font=URBAN_BOLD, font=BOLD_FONT etc.
    code = re.sub(r',?\s*font\s*=\s*[A-Z_][A-Z_0-9]*(?=[,\)])', '', code)
    # Replace hallucinated animation classes with correct ones
    code = re.sub(r'\bGrowCorner\b', 'GrowFromCenter', code)
    code = re.sub(r'\bGrowFromEdge\b', 'GrowFromCenter', code)
    code = re.sub(r'\bSpinInFromNothing\b', 'FadeIn', code)
    code = re.sub(r'\bRollIn\b', 'FadeIn', code)
    code = re.sub(r'\bSlideIn\b', 'FadeIn', code)
    # Replace hallucinated color constants with valid Manim colors
    code = re.sub(r'\bLIME\b', 'LIME_GREEN', code)
    code = re.sub(r'\bPURPLE_LIGHT\b', 'PURPLE_A', code)
    code = re.sub(r'\bLIGHT_BLUE\b', 'BLUE_A', code)
    code = re.sub(r'\bLIGHT_GREEN\b', 'GREEN_A', code)
    code = re.sub(r'\bLIGHT_RED\b', 'RED_A', code)
    code = re.sub(r'\bDARK_BLUE\b', 'DARK_BLUE', code)
    code = re.sub(r'\bGRAY_LIGHT\b', 'GRAY_A', code)
    code = re.sub(r'\bGRAY_DARK\b', 'GRAY_E', code)
    # Remove corner_radius from shapes that don't support it
    # Only RoundedRectangle supports corner_radius
    # Step 1: temporarily protect RoundedRectangle's corner_radius
    code = re.sub(
        r'(RoundedRectangle\([^)]*?),?\s*corner_radius\s*=\s*([\d.]+)',
        r'\1,__CR__=\2',
        code
    )
    # Step 2: remove all remaining corner_radius
    code = re.sub(r',?\s*corner_radius\s*=\s*[\d.]+', '', code)
    # Step 3: restore RoundedRectangle's corner_radius
    code = re.sub(r',__CR__=([\d.]+)', r', corner_radius=\1', code)
    # Remove hallucinated Arrow/shape parameters
    code = re.sub(r',?\s*width_to_tip_len_ratio\s*=\s*[^,\)\n]+', '', code)
    code = re.sub(r',?\s*tip_length\s*=\s*[^,\)\n]+', '', code)
    code = re.sub(r',?\s*tip_width_ratio\s*=\s*[^,\)\n]+', '', code)
    # Replace FRAME_WIDTH/FRAME_HEIGHT with config.frame_width/height
    code = re.sub(r'\bFRAME_WIDTH\b', 'config.frame_width', code)
    code = re.sub(r'\bFRAME_HEIGHT\b', 'config.frame_height', code)
    # Fix set_fill(fill_opacity=...) -> set_fill(opacity=...)
    code = re.sub(r'\.set_fill\(([^)]*?)fill_opacity\s*=', r'.set_fill(\1opacity=', code)
    # Fix set_stroke(stroke_opacity=...) -> set_stroke(opacity=...)
    code = re.sub(r'\.set_stroke\(([^)]*?)stroke_opacity\s*=', r'.set_stroke(\1opacity=', code)
    # Wrap bare string literals inside VGroup(...) with Text()
    # e.g. VGroup(rect, "label") -> VGroup(rect, Text("label"))
    code = re.sub(
        r'VGroup\(([^)]+)\)',
        lambda m: 'VGroup(' + re.sub(
            r'(?<![=\w])"([^"]+)"',
            r'Text("\1")',
            m.group(1)
        ) + ')',
        code
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
    """Generate Manim code via IR (AnimationPlan JSON -> compiler)."""
    system_prompt, user_prompt = _build_ir_prompt(spec)

    # Try up to 2 times: initial generation + 1 repair attempt
    for attempt in range(2):
        raw = await _call_llm(system_prompt, user_prompt, max_tokens=3000)

        try:
            # Extract JSON from LLM response
            plan_json = _extract_json(raw)
            plan = AnimationPlan.model_validate(plan_json)

            # Preflight check: validate plan before compilation
            errors = preflight_check(plan)
            if errors:
                error_msg = f"AnimationPlan validation failed: {'; '.join(errors[:3])}"
                logger.warning("generate_manim_code[IR]: preflight failed, errors=%s", errors)
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
            logger.info("generate_manim_code[IR]: topic=%s code_length=%d attempt=%d",
                       spec.get("topic"), len(code), attempt)
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
        logger.warning("generate_manim_code[legacy]: syntax error, repairing: %s", syntax_error)
        code = _sanitize_manim_code(_extract_python_code(
            await _call_llm(*_build_repair_prompt(code, syntax_error), max_tokens=2400)
        ))
    logger.info("generate_manim_code[legacy]: topic=%s code_length=%d", spec.get("topic"), len(code))
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
你是一名动画设计专家。你只输出 AnimationPlan JSON，不输出任何解释。

AnimationPlan 结构：
{
  "scene_meta": {"title": "标题", "subtitle": "副标题", "duration_seconds": 8, "background_gradient": ["#0a0e27", "#1a1e3a"]},
  "objects": [{"id": "唯一ID", "type": "box|circle|dot|text|arrow", "label": "标签", "color": "颜色", "position": [-4, 0], "size": {"width": 2.5, "height": 1.5}, "style": {"fill_opacity": 0.3, "corner_radius": 0.2}}],
  "timeline": [{"description": "描述", "actions": [{"type": "动画类型", "target": "对象ID", "params": {}, "lag_ratio": 0.2}], "wait_after": 0.3}],
  "text_blocks": [{"id": "ID", "content": "文字", "position": "bottom", "color": "WHITE", "font_size": 26, "offset": [0, 0]}]
}

重要规则：
- objects 的 position 必须是数字数组 [x, y]，如 [-4, 0] 表示左侧，[4, 0] 表示右侧，[0, 0] 表示中心
- 不要用字符串如 "left" 或 ["center", "middle"]，必须用数字
- text_blocks 的 position 可以用字符串 "top"/"bottom"/"left"/"right"/"center"
- 可用 type: box, circle, dot, text, arrow
- 可用动画: fade_in, fade_out, create, indicate（强烈推荐）
- 严格禁止使用: transform, move_to, highlight, flash（这些动作容易出错）
- 所有对象必须在 objects 里预先定义，不能在 timeline 里引用不存在的对象
- 可用颜色: WHITE, BLACK, GRAY, GRAY_A, RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE, TEAL, MAROON, GOLD, PINK 及 _A/_B/_C/_D/_E 变体

示例 1 - TCP 三次握手：
{
  "scene_meta": {"title": "TCP 三次握手", "subtitle": "建立连接的三个步骤", "duration_seconds": 8, "background_gradient": ["#f3fbff", "#d8ecfb"]},
  "objects": [
    {"id": "client", "type": "box", "label": "客户端", "color": "BLUE_C", "position": [-4, 0], "size": {"width": 2.5, "height": 1.5}, "style": {"fill_opacity": 0.2, "corner_radius": 0.2}},
    {"id": "server", "type": "box", "label": "服务器", "color": "GREEN_C", "position": [4, 0], "size": {"width": 2.5, "height": 1.5}, "style": {"fill_opacity": 0.2, "corner_radius": 0.2}},
    {"id": "arrow1", "type": "arrow", "label": "", "color": "TEAL", "position": [0, 1], "style": {"start": [-2.5, 0.5], "end": [2.5, 0.5]}},
    {"id": "arrow2", "type": "arrow", "label": "", "color": "ORANGE", "position": [0, 0], "style": {"start": [2.5, 0], "end": [-2.5, 0]}},
    {"id": "arrow3", "type": "arrow", "label": "", "color": "PURPLE", "position": [0, -1], "style": {"start": [-2.5, -0.5], "end": [2.5, -0.5]}}
  ],
  "timeline": [
    {"description": "显示客户端和服务器", "actions": [{"type": "fade_in", "target": ["client", "server"]}], "wait_after": 0.5},
    {"description": "SYN", "actions": [{"type": "create", "target": "arrow1"}, {"type": "indicate", "target": "client", "params": {"color": "YELLOW"}}], "wait_after": 1.0},
    {"description": "SYN-ACK", "actions": [{"type": "create", "target": "arrow2"}, {"type": "indicate", "target": "server", "params": {"color": "YELLOW"}}], "wait_after": 1.0},
    {"description": "ACK", "actions": [{"type": "create", "target": "arrow3"}, {"type": "indicate", "target": "client", "params": {"color": "YELLOW"}}], "wait_after": 1.0}
  ],
  "text_blocks": [{"id": "summary", "content": "三次握手完成，连接建立", "position": "bottom", "color": "MAROON", "font_size": 28, "offset": [0, 0]}]
}

示例 2 - HTTP 请求响应（带镜头切换）：
{
  "scene_meta": {"title": "HTTP 请求响应", "subtitle": "客户端与服务器交互", "duration_seconds": 8, "background_gradient": ["#f3fbff", "#d8ecfb"]},
  "objects": [
    {"id": "browser", "type": "box", "label": "浏览器", "color": "BLUE_C", "position": [-3, 0], "size": {"width": 2.0, "height": 1.2}, "style": {"fill_opacity": 0.2, "corner_radius": 0.2}},
    {"id": "server", "type": "box", "label": "服务器", "color": "GREEN_C", "position": [3, 0], "size": {"width": 2.0, "height": 1.2}, "style": {"fill_opacity": 0.2, "corner_radius": 0.2}},
    {"id": "request_arrow", "type": "arrow", "label": "", "color": "TEAL", "position": [0, 0.8], "style": {"start": [-1.5, 0.8], "end": [1.5, 0.8]}},
    {"id": "response_arrow", "type": "arrow", "label": "", "color": "ORANGE", "position": [0, -0.8], "style": {"start": [1.5, -0.8], "end": [-1.5, -0.8]}}
  ],
  "timeline": [
    {"description": "显示浏览器", "actions": [{"type": "fade_in", "target": "browser"}], "wait_after": 0.5},
    {"description": "显示服务器", "actions": [{"type": "fade_in", "target": "server"}], "wait_after": 0.5},
    {"description": "发送请求", "actions": [{"type": "create", "target": "request_arrow"}, {"type": "indicate", "target": "browser", "params": {"color": "YELLOW"}}], "wait_after": 1.5},
    {"description": "返回响应", "actions": [{"type": "fade_out", "target": "request_arrow"}, {"type": "create", "target": "response_arrow"}, {"type": "indicate", "target": "server", "params": {"color": "YELLOW"}}], "wait_after": 1.5}
  ],
  "text_blocks": [{"id": "summary", "content": "请求-响应循环完成", "position": "bottom", "color": "MAROON", "font_size": 28, "offset": [0, 0]}]
}
"""

    scenes_text = "\n".join(
        f"  场景{i+1}【{s.get('title', '')}】：{s.get('description', '')}（重点：{s.get('emphasis', '')}）"
        for i, s in enumerate(scenes)
    )
    objects_text = "\n".join(
        f"  - {(obj.get('label') or obj) if isinstance(obj, dict) else obj}"
        for obj in objects
    ) or "  （无指定对象）"

    user_prompt = f"""\
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
【视觉主题配色】背景渐变必须使用 {bg_suggestion}，强调色为 {accent_color}

设计要求：
1. background_gradient 必须使用上面指定的配色 {bg_suggestion}
2. 文本字号偏大：title >= 50，节点标签 >= 30，说明文字 >= 28
3. box 类型用圆角卡片，accent 色优先使用 {accent_color}
4. 除流程框外，至少加入 2 个辅助图形对象（circle/dot/text）增强画面生动感
5. 多用镜头切换（fade_out 旧 + fade_in 新），重点用 indicate
6. 最后加 text_block 总结
7. 【重要】所有标签必须使用中文，禁止出现英文标签或副标题
8. 【重要】对象标签必须使用具体内容，禁止使用 A/B/C/D/E 等占位符
   - 排序算法：用具体数字如 "5"、"3"、"8"
   - 协议步骤：用具体名称如 "SYN"、"ACK"
   - 流程节点：用具体操作名称
9. 【重要】position 必须合理分布，避免对象重叠：
   - 5个对象横排：x 坐标用 -4, -2, 0, 2, 4
   - 3个对象横排：x 坐标用 -3, 0, 3
   - 纵向排列：y 坐标用 2, 0, -2
10. 【重要】对象颜色必须使用深色或高饱和度，禁止使用 WHITE/GRAY_A/GRAY_B 等浅色
    - 推荐：BLUE_C, GREEN_C, RED_C, ORANGE, PURPLE, TEAL, MAROON, GOLD
    - 禁止：WHITE, GRAY, GRAY_A, GRAY_B, GRAY_C（浅色背景看不清）
11. 【重要】timeline 必须分场景渐进，每个 step 只显示 1-2 个对象，用 fade_out 切换旧对象

输出 JSON："""

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

    # Step 2: Try rendering
    render_error: str | None = None
    for attempt in range(_MAX_REPAIR_ATTEMPTS + 1):
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
                "render_gif_via_manim: saved gif size=%d path=%s attempt=%d",
                len(gif_bytes), storage_path, attempt
            )
            return str(path)

        except (ValueError, RuntimeError) as exc:
            render_error = str(exc)
            logger.warning(
                "render_gif_via_manim: attempt %d failed: %s", attempt, render_error
            )
            if attempt < _MAX_REPAIR_ATTEMPTS:
                logger.info("render_gif_via_manim: attempting LLM code repair")
                try:
                    code = await repair_manim_code(code, render_error)
                except Exception as repair_exc:
                    logger.warning("LLM repair failed: %s", repair_exc)
                    break

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
