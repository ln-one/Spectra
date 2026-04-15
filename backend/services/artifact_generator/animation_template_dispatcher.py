"""Template dispatcher: classify topic, match template, and fill slots with LLM."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Callable

from .animation_templates import (
    template_comparison,
    template_process_flow,
    template_protocol_exchange,
)
from .animation_templates_high_frequency import (
    template_biological_cycle,
    template_data_flow,
    template_scientific_process,
)

logger = logging.getLogger(__name__)

TemplateFn = Callable[[dict[str, Any]], dict[str, Any]]

_TEMPLATE_FUNCTIONS: dict[str, TemplateFn] = {
    "protocol_exchange": template_protocol_exchange,
    "process_flow": template_process_flow,
    "comparison": template_comparison,
    "scientific_process": template_scientific_process,
    "biological_cycle": template_biological_cycle,
    "data_flow": template_data_flow,
}

_TEMPLATE_RULES = [
    {
        "name": "protocol_exchange",
        "keywords": [
            "tcp",
            "http",
            "dns",
            "handshake",
            "request",
            "response",
            "protocol",
            "握手",
            "协议",
            "请求",
            "响应",
            "三次握手",
            "四次挥手",
        ],
    },
    {
        "name": "scientific_process",
        "keywords": [
            "photosynthesis",
            "respiration",
            "water cycle",
            "evaporation",
            "condensation",
            "光合作用",
            "呼吸作用",
            "水循环",
            "蒸发",
            "化学反应",
            "催化",
        ],
    },
    {
        "name": "biological_cycle",
        "keywords": [
            "mitosis",
            "cell cycle",
            "meiosis",
            "life cycle",
            "metamorphosis",
            "有丝分裂",
            "细胞周期",
            "减数分裂",
            "生命周期",
            "变态发育",
            "细胞分裂",
        ],
    },
    {
        "name": "data_flow",
        "keywords": [
            "data flow",
            "data pipeline",
            "algorithm",
            "inference",
            "preprocess",
            "etl",
            "feature",
            "数据流",
            "数据管道",
            "算法",
            "推理",
            "预处理",
            "特征",
        ],
    },
    {
        "name": "process_flow",
        "keywords": [
            "pipeline",
            "process",
            "workflow",
            "stage",
            "step",
            "流程",
            "工作流",
            "阶段",
            "步骤",
            "管道",
        ],
    },
    {
        "name": "comparison",
        "keywords": [
            "comparison",
            "compare",
            "vs",
            "tradeoff",
            "before",
            "after",
            "对比",
            "比较",
            "优缺点",
            "区别",
        ],
    },
]

_ALLOWED_CLASSIFIER_OUTPUT = tuple(_TEMPLATE_FUNCTIONS.keys()) + ("none",)


def _extract_json(raw: str) -> dict[str, Any]:
    match = re.search(r"\{[\s\S]*\}", str(raw or ""))
    if not match:
        logger.warning("No JSON found in LLM response for slot filling")
        return {}
    try:
        data = json.loads(match.group(0))
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse JSON from LLM response: {e}")
        return {}


def _canonical_template_name(value: Any) -> str:
    name = str(value or "").strip().lower()
    aliases = {
        "science_process": "scientific_process",
        "science": "scientific_process",
        "bio_cycle": "biological_cycle",
        "biology_cycle": "biological_cycle",
        "flow": "data_flow",
        "algorithm_flow": "data_flow",
        "none": "none",
    }
    return aliases.get(name, name)


async def classify_topic_template(spec: dict[str, Any], llm_call_fn) -> str | None:
    """Classify topic into a template family with LLM."""
    topic = str(spec.get("topic") or "").strip()
    focus = str(spec.get("focus") or "").strip()
    visual_type = str(spec.get("visual_type") or "").strip()
    subject_family = str(spec.get("subject_family") or "").strip()
    scenes = spec.get("scenes") or []
    scene_text = "\n".join(
        (
            f"- {str(scene.get('title') or '').strip()}: "
            f"{str(scene.get('description') or '').strip()}"
        )
        for scene in scenes[:4]
        if isinstance(scene, dict)
    )

    system_prompt = (
        "You are a strict animation theme classifier. "
        "Return JSON only and do not include markdown."
    )
    user_prompt = f"""
Classify this educational animation topic into one template.

Allowed templates:
- scientific_process: science mechanisms (photosynthesis/respiration/water cycle)
- biological_cycle: cyclical biology topics (cell cycle/life cycle)
- data_flow: data processing or algorithm pipeline
- protocol_exchange: two-side request/response exchange
- process_flow: generic linear process
- comparison: A vs B comparison
- none: does not fit templates

Topic: {topic}
Focus: {focus}
Visual type: {visual_type}
Subject family: {subject_family}
Scenes:
{scene_text or '- (none)'}

Return JSON:
{{
  "template": "allowed template name or none",
  "confidence": 0.0,
  "reason": "short phrase"
}}

Rules:
- Use "none" when confidence < 0.62.
- Prefer specific templates first: scientific_process / biological_cycle / data_flow.
"""

    try:
        raw = await llm_call_fn(system_prompt, user_prompt, 600)
    except Exception as exc:
        logger.info("Template classifier failed: %s", exc)
        return None

    data = _extract_json(raw)
    template_name = _canonical_template_name(data.get("template"))
    confidence = data.get("confidence")
    try:
        confidence = float(confidence)
    except (TypeError, ValueError):
        confidence = 0.0

    if template_name not in _ALLOWED_CLASSIFIER_OUTPUT:
        return None
    if template_name == "none" or confidence < 0.62:
        logger.info(
            "Template classifier miss: template=%s confidence=%.2f topic=%s",
            template_name,
            confidence,
            topic,
        )
        return None

    logger.info(
        "Template classifier hit: template=%s confidence=%.2f topic=%s",
        template_name,
        confidence,
        topic,
    )
    return template_name


def match_template(topic: str, spec: dict[str, Any]) -> tuple[str, TemplateFn] | None:
    """Rule-based fallback matcher (keywords + subject family)."""
    topic_lower = str(topic or "").lower()
    subject_family = str(spec.get("subject_family") or "").strip().lower()

    for rule in _TEMPLATE_RULES:
        if any(kw in topic_lower for kw in rule["keywords"]):
            name = rule["name"]
            fn = _TEMPLATE_FUNCTIONS.get(name)
            if fn:
                logger.info("Matched template by keyword: %s", name)
                return name, fn

    family_to_template = {
        "protocol_exchange": "protocol_exchange",
        "pipeline_sequence": "data_flow",
        "lifecycle_cycle": "biological_cycle",
    }
    selected = family_to_template.get(subject_family)
    if selected and selected in _TEMPLATE_FUNCTIONS:
        logger.info("Matched template by subject_family: %s", selected)
        return selected, _TEMPLATE_FUNCTIONS[selected]

    return None


async def select_template(
    spec: dict[str, Any], llm_call_fn
) -> tuple[str, TemplateFn] | None:
    """Preferred template selector: LLM classifier first, rule matcher second."""
    classified = await classify_topic_template(spec, llm_call_fn)
    if classified and classified in _TEMPLATE_FUNCTIONS:
        return classified, _TEMPLATE_FUNCTIONS[classified]

    topic = str(spec.get("topic") or "")
    return match_template(topic, spec)


async def fill_template_slots(
    template_name: str, spec: dict[str, Any], llm_call_fn
) -> dict[str, Any]:
    """Use LLM to fill template slots based on normalized animation spec."""
    topic = spec.get("topic", "")
    scenes = spec.get("scenes", [])
    objects = spec.get("object_details", [])

    if template_name == "protocol_exchange":
        return await _fill_protocol_exchange_slots(topic, scenes, objects, llm_call_fn)
    if template_name == "process_flow":
        return await _fill_process_flow_slots(topic, scenes, objects, llm_call_fn)
    if template_name == "comparison":
        return await _fill_comparison_slots(topic, scenes, objects, llm_call_fn)
    if template_name == "scientific_process":
        return await _fill_scientific_process_slots(topic, scenes, objects, llm_call_fn)
    if template_name == "biological_cycle":
        return await _fill_biological_cycle_slots(topic, scenes, objects, llm_call_fn)
    if template_name == "data_flow":
        return await _fill_data_flow_slots(topic, scenes, objects, llm_call_fn)
    return {}


async def _fill_protocol_exchange_slots(
    topic: str, scenes: list, objects: list, llm_call_fn
) -> dict[str, Any]:
    scenes_text = "\n".join(
        f"{i + 1}. {s.get('title', '')}: {s.get('description', '')}"
        for i, s in enumerate(scenes)
        if isinstance(s, dict)
    )
    objects_text = "\n".join(
        f"- {obj.get('label', obj) if isinstance(obj, dict) else obj}"
        for obj in objects
    )

    raw = await llm_call_fn(
        "Return JSON only.",
        f"""
Fill slots for protocol_exchange animation.
Topic: {topic}
Scenes:
{scenes_text or '-'}
Objects:
{objects_text or '-'}

Return JSON:
{{
  "left_label": "...",
  "right_label": "...",
  "steps": [
    {{"arrow_label": "...", "direction": "left_to_right", "emphasis": "left"}},
    {{"arrow_label": "...", "direction": "right_to_left", "emphasis": "right"}}
  ]
}}
""",
        1200,
    )
    return _extract_json(raw)


async def _fill_process_flow_slots(
    topic: str, scenes: list, objects: list, llm_call_fn
) -> dict[str, Any]:
    scenes_text = "\n".join(
        f"{i + 1}. {s.get('title', '')}: {s.get('description', '')}"
        for i, s in enumerate(scenes)
        if isinstance(s, dict)
    )
    raw = await llm_call_fn(
        "Return JSON only.",
        f"""
Fill slots for process_flow animation.
Topic: {topic}
Scenes:
{scenes_text or '-'}

Return JSON:
{{"stages": ["...", "...", "...", "..."]}}
""",
        800,
    )
    return _extract_json(raw)


async def _fill_comparison_slots(
    topic: str, scenes: list, objects: list, llm_call_fn
) -> dict[str, Any]:
    scenes_text = "\n".join(
        f"{i + 1}. {s.get('title', '')}: {s.get('description', '')}"
        for i, s in enumerate(scenes)
        if isinstance(s, dict)
    )
    raw = await llm_call_fn(
        "Return JSON only.",
        f"""
Fill slots for comparison animation.
Topic: {topic}
Scenes:
{scenes_text or '-'}

Return JSON:
{{
  "left_title": "...",
  "left_items": ["...", "...", "..."],
  "right_title": "...",
  "right_items": ["...", "...", "..."]
}}
""",
        1000,
    )
    return _extract_json(raw)


async def _fill_scientific_process_slots(
    topic: str, scenes: list, objects: list, llm_call_fn
) -> dict[str, Any]:
    raw = await llm_call_fn(
        "Return JSON only.",
        f"""
Fill slots for scientific_process animation.
Topic: {topic}

Return JSON:
{{
  "title": "...",
  "stages": ["...", "...", "...", "..."],
  "highlights": ["...", "...", "...", "..."]
}}
""",
        900,
    )
    return _extract_json(raw)


async def _fill_biological_cycle_slots(
    topic: str, scenes: list, objects: list, llm_call_fn
) -> dict[str, Any]:
    raw = await llm_call_fn(
        "Return JSON only.",
        f"""
Fill slots for biological_cycle animation.
Topic: {topic}

Return JSON:
{{
  "cycle_name": "...",
  "phases": ["...", "...", "...", "..."]
}}
""",
        800,
    )
    return _extract_json(raw)


async def _fill_data_flow_slots(
    topic: str, scenes: list, objects: list, llm_call_fn
) -> dict[str, Any]:
    raw = await llm_call_fn(
        "Return JSON only.",
        f"""
Fill slots for data_flow animation.
Topic: {topic}

Return JSON:
{{
  "input_label": "...",
  "process_steps": ["...", "...", "..."],
  "output_label": "..."
}}
""",
        900,
    )
    return _extract_json(raw)
