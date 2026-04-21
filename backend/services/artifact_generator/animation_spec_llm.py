"""LLM-driven animation spec generator.

Replaces the keyword-matching pipeline in animation_spec.py with a real
LLM call so that scenes, focus, visual_type and objects are derived from
the teaching content rather than a fixed template.

The output is intentionally kept compatible with normalize_animation_spec()
so that the downstream renderer receives the same validated spec shape it
always has.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
你是一名专业的教学动画编导，负责根据教学主题为课堂演示动画设计分镜脚本。
你的输出会直接驱动动画渲染器，因此必须严格遵守 JSON 格式，不能输出任何额外说明或代码块标记。
"""

_USER_PROMPT_TEMPLATE = """\
请根据以下教学信息，为课堂演示动画设计一份分镜脚本。

【主题】{topic}
【教学目标】{teaching_goal}
【内容摘要】{summary}
【表现重点】{focus}
【参考资料片段】
{rag_text}
【动画时长】约 {duration_seconds} 秒
【节奏】{rhythm}

---
设计要求：
1. scenes 数量根据时长决定：6秒以内3个，10秒以内3-4个，10秒以上4-5个。
2. 每个 scene 的 title 和 description 必须与主题强相关，禁止使用"引入主题""关键变化""收束结论"等通用模板词。
3. visual_type 从以下三个值中选择最合适的一个：
   - "process_flow"：适合步骤、流程、协议交互、因果链条
   - "structure_breakdown"：适合分层、结构拆解、组成关系
   - "relationship_change"：适合趋势、变化、对比、动态关系
4. subject_family 从以下值中选最合适的一个：
   "protocol_exchange" | "traversal_path" | "energy_transfer" |
   "lifecycle_cycle" | "pipeline_sequence" | "structure_layers" |
   "trend_change" | "generic_process"
5. objects 列出动画中出现的关键对象（2-5个），每个对象需有 id、label、kind、role。
   kind 从以下值选择：endpoint | payload | step | layer | node | stage | point | source | channel | converter | output
   【重要】label 必须使用具体内容，禁止使用 A/B/C/D/E 等占位符：
   - 排序算法：用具体数字如 "5"、"3"、"8"、"1"、"9"
   - 协议步骤：用具体名称如 "SYN"、"ACK"、"GET /index.html"
   - 流程节点：用具体操作如 "词法分析"、"构建语法树"
6. focus 用一句话说明动画最需要表达的核心内容。
7. 每个 scene 必须包含：title、description、emphasis、shot_type、transition、camera、key_points（1-3条）。
   - shot_type：第一个场景必须是 "intro"，最后一个必须是 "summary"，中间为 "focus"
   - transition：从 cut/dissolve/soft_wipe/fade 中选择
   - camera：从 wide/medium/close/zoom_in/zoom_out/track_left/track_right 中选择
   - key_points：每条不超过20字，直接描述该场景的教学要点

只输出如下 JSON 结构，不要有任何额外内容：
{{
  "visual_type": "...",
  "subject_family": "...",
  "focus": "...",
  "scenes": [
    {{
      "id": "scene-1",
      "title": "...",
      "description": "...",
      "emphasis": "...",
      "shot_type": "intro",
      "transition": "cut",
      "camera": "wide",
      "key_points": ["...", "..."]
    }}
  ],
  "objects": [
    {{
      "id": "...",
      "label": "...",
      "kind": "...",
      "role": "..."
    }}
  ]
}}
"""

_VALID_VISUAL_TYPES = {"process_flow", "relationship_change", "structure_breakdown"}
_VALID_SUBJECT_FAMILIES = {
    "generic_process",
    "protocol_exchange",
    "pipeline_sequence",
    "lifecycle_cycle",
    "traversal_path",
    "energy_transfer",
    "structure_layers",
    "trend_change",
}
_VALID_SHOT_TYPES = {"intro", "focus", "summary"}
_VALID_TRANSITIONS = {
    "cut",
    "dissolve",
    "soft_wipe",
    "blinds",
    "shutter",
    "fade",
    "slide",
    "zoom",
    "wipe",
}
_VALID_CAMERAS = {
    "wide",
    "medium",
    "close",
    "track_left",
    "track_right",
    "zoom_in",
    "zoom_out",
}
_VALID_KINDS = {
    "endpoint",
    "payload",
    "step",
    "layer",
    "node",
    "stage",
    "point",
    "source",
    "channel",
    "converter",
    "output",
}


def _build_prompt(content: dict[str, Any], rag_snippets: list[str]) -> tuple[str, str]:
    topic = str(content.get("topic") or content.get("title") or "教学主题").strip()
    teaching_goal = str(
        content.get("teaching_goal")
        or content.get("focus")
        or content.get("summary")
        or topic
    ).strip()
    summary = str(content.get("summary") or "").strip()
    focus = str(content.get("focus") or content.get("motion_brief") or "").strip()
    duration_seconds = int(content.get("duration_seconds") or 6)
    rhythm = str(content.get("rhythm") or "balanced").strip()

    rag_text = (
        "\n".join(f"- {s}" for s in rag_snippets[:3])
        if rag_snippets
        else "（无参考资料）"
    )

    user_prompt = _USER_PROMPT_TEMPLATE.format(
        topic=topic,
        teaching_goal=teaching_goal,
        summary=summary or "（未提供）",
        focus=focus or "（未提供）",
        rag_text=rag_text,
        duration_seconds=duration_seconds,
        rhythm=rhythm,
    )
    return _SYSTEM_PROMPT, user_prompt


# ---------------------------------------------------------------------------
# LLM call
# ---------------------------------------------------------------------------


async def _call_llm(system_prompt: str, user_prompt: str) -> str:
    """Call the project's AI service and return raw text."""
    from services.ai import ai_service

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    import asyncio
    import os

    from services.ai import acompletion

    model = os.getenv("SMALL_MODEL") or os.getenv("DEFAULT_MODEL") or "qwen3.5-flash"
    timeout = float(os.getenv("AI_REQUEST_TIMEOUT_SECONDS", "60"))

    response = await asyncio.wait_for(
        acompletion(
            model=model,
            messages=messages,
            max_tokens=12000,
        ),
        timeout=timeout,
    )
    content = response.choices[0].message.content or ""
    if isinstance(content, list):
        content = " ".join(
            item.get("text", "") for item in content if isinstance(item, dict)
        )
    return str(content).strip()


# ---------------------------------------------------------------------------
# JSON extraction & validation
# ---------------------------------------------------------------------------


def _extract_json(raw: str) -> dict[str, Any] | None:
    """Extract the first JSON object from LLM output (handles markdown fences)."""
    # Strip common markdown code fences
    cleaned = re.sub(r"```(?:json)?", "", raw).strip()
    # Try direct parse first
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # Try to find the outermost { ... }
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return None


def _validate_and_repair(
    data: dict[str, Any], content: dict[str, Any]
) -> dict[str, Any]:
    """Validate the parsed dict and fill in safe defaults for any missing/invalid fields."""
    # visual_type
    vt = str(data.get("visual_type") or "").strip().lower()
    if vt not in _VALID_VISUAL_TYPES:
        vt = "process_flow"
    data["visual_type"] = vt

    # subject_family
    sf = str(data.get("subject_family") or "").strip().lower()
    if sf not in _VALID_SUBJECT_FAMILIES:
        sf = "generic_process"
    data["subject_family"] = sf

    # focus
    focus = str(
        data.get("focus") or content.get("focus") or content.get("topic") or ""
    ).strip()
    data["focus"] = focus[:120]

    # scenes
    raw_scenes = data.get("scenes")
    if not isinstance(raw_scenes, list) or not raw_scenes:
        logger.warning("animation_spec_llm: LLM returned no scenes, will fall back")
        return {}

    repaired_scenes = []
    for i, scene in enumerate(raw_scenes[:5]):
        if not isinstance(scene, dict):
            continue
        shot_type = str(scene.get("shot_type") or "focus").strip().lower()
        if shot_type not in _VALID_SHOT_TYPES:
            shot_type = "focus"
        transition = str(scene.get("transition") or "dissolve").strip().lower()
        if transition not in _VALID_TRANSITIONS:
            transition = "dissolve"
        camera = str(scene.get("camera") or "medium").strip().lower()
        if camera not in _VALID_CAMERAS:
            camera = "medium"
        kps = scene.get("key_points")
        if not isinstance(kps, list):
            kps = []
        repaired_scenes.append(
            {
                "id": str(scene.get("id") or f"scene-{i + 1}"),
                "title": str(scene.get("title") or f"镜头 {i + 1}")[:28],
                "description": str(scene.get("description") or "")[:160],
                "emphasis": str(scene.get("emphasis") or "")[:60],
                "shot_type": shot_type,
                "transition": transition,
                "camera": camera,
                "key_points": [str(k)[:40] for k in kps[:3] if k],
            }
        )

    if not repaired_scenes:
        return {}

    # Enforce first=intro, last=summary
    repaired_scenes[0]["shot_type"] = "intro"
    repaired_scenes[-1]["shot_type"] = "summary"

    data["scenes"] = repaired_scenes

    # objects
    raw_objects = data.get("objects")
    if not isinstance(raw_objects, list):
        raw_objects = []
    repaired_objects = []
    for j, obj in enumerate(raw_objects[:6]):
        if not isinstance(obj, dict):
            continue
        kind = str(obj.get("kind") or "step").strip().lower()
        if kind not in _VALID_KINDS:
            kind = "step"
        repaired_objects.append(
            {
                "id": str(obj.get("id") or f"object-{j + 1}"),
                "label": str(obj.get("label") or f"对象 {j + 1}")[:24],
                "kind": kind,
                "role": str(obj.get("role") or "")[:120],
            }
        )
    data["objects"] = repaired_objects

    return data


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def generate_animation_spec_with_llm(
    content: dict[str, Any],
    rag_snippets: list[str] | None = None,
) -> dict[str, Any] | None:
    """Generate animation spec fields using LLM.

    Returns a partial spec dict containing:
        visual_type, subject_family, focus, scenes, objects

    Returns None if the LLM call fails or produces unusable output,
    so the caller can fall back to the rule-based pipeline.
    """
    snippets = rag_snippets or []
    try:
        system_prompt, user_prompt = _build_prompt(content, snippets)
        raw = await _call_llm(system_prompt, user_prompt)
        logger.debug("animation_spec_llm: raw LLM output length=%d", len(raw))

        parsed = _extract_json(raw)
        if not parsed:
            logger.warning("animation_spec_llm: could not extract JSON from LLM output")
            return None

        validated = _validate_and_repair(parsed, content)
        if not validated:
            logger.warning("animation_spec_llm: validation produced empty result")
            return None

        logger.info(
            "animation_spec_llm: generated spec visual_type=%s subject_family=%s scenes=%d",
            validated.get("visual_type"),
            validated.get("subject_family"),
            len(validated.get("scenes") or []),
        )
        return validated

    except Exception as exc:
        logger.warning(
            "animation_spec_llm: failed with %s, caller should fall back", exc
        )
        return None


def merge_llm_spec_into_content(
    content: dict[str, Any],
    llm_spec: dict[str, Any],
) -> dict[str, Any]:
    """Merge LLM-generated fields into the original content dict.

    The merged dict is then passed to normalize_animation_spec() for
    final validation and shape normalisation.  Original fields that the
    LLM did not touch (duration_seconds, rhythm, style_pack, …) are
    preserved unchanged.
    """
    merged = dict(content)
    # Overwrite only the fields the LLM is responsible for
    for key in ("visual_type", "subject_family", "focus", "scenes", "objects"):
        value = llm_spec.get(key)
        if value:
            merged[key] = value
    # Map objects -> object_details so normalize_animation_spec picks them up
    if llm_spec.get("objects"):
        merged["object_details"] = llm_spec["objects"]
    return merged
