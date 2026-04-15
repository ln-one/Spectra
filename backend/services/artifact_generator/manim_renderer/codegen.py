"""Manim code generation through templates and LLM-generated IR."""

from __future__ import annotations

import asyncio
import json as _json
import os
from typing import Any

from services.artifact_generator.animation_compiler import (
    compile_animation_plan_from_json,
    preflight_check,
)
from services.artifact_generator.animation_ir import AnimationPlan

from .code_utils import (
    _build_safe_fallback_code,
    _check_syntax,
    _extract_json,
    _extract_python_code,
    _sanitize_manim_code,
)
from .config import logger
from .ir_alignment import _align_timeline_with_scenes
from .prompts import _build_generation_prompt, _build_ir_prompt, _build_repair_prompt


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
    from services.artifact_generator.animation_compiler import (
        compile_animation_plan_from_json,
    )
    from services.artifact_generator.animation_template_dispatcher import (
        fill_template_slots,
        select_template,
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


async def repair_manim_code(code: str, error: str) -> str:
    """Ask LLM to fix broken Manim code given the error message."""
    system_prompt, user_prompt = _build_repair_prompt(code, error)
    raw = await _call_llm(system_prompt, user_prompt, max_tokens=2400)
    return _sanitize_manim_code(_extract_python_code(raw))
