"""LLM-driven explainer draft generation and repair."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any

from services.ai import acompletion
from services.ai.model_resolution import _resolve_model_name

from .animation_runtime_codegen import build_explainer_draft_seed
from .animation_runtime_contract import (
    ExplainerDraftV1,
    build_runtime_contract_prompt_fragment,
)

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
你是一名解释型 2D 动画 explainer draft 生成器。
你必须返回严格 JSON，不要输出 markdown，不要输出解释，不要输出代码块围栏。
你的任务不是写代码，也不是生成完整 runtime graph，而是生成一份小而稳定的 JSON 草稿。
JSON 必须可被本地 deterministic graph assembler 直接消费。
"""

_USER_PROMPT_TEMPLATE = """\
请根据以下已归一化动画语义，生成一份严格受控的 explainer draft JSON。

【runtime_contract】explainer_draft.v1
【family_hint】{family_hint}
【title】{title}
【summary】{summary}
【topic】{topic}
【focus】{focus}
【duration_seconds】{duration_seconds}
【rhythm】{rhythm}
【style_pack】{style_pack}
【prompt_digest】{prompt_digest}
【scene_outline】
{scene_outline_json}
【steps】
{steps_json}

{contract_prompt}

这是 canonical explainer draft seed，请严格参考：
{seed_draft_json}

硬性约束：
1. 只输出一个 JSON object，不要有任何额外文本。
2. 输出必须匹配 explainer_draft.v1。
3. 不要输出 runtime code、primitive props、hook 名或 graph 内部字段。
4. step_captions.length 必须与输入 steps.length 完全一致。
5. action_hints.length 必须与输入 steps.length 完全一致。
6. family_hint 必须与输入 family_hint 完全一致。
7. 你可以润色文案和对象标签，但不能改变原始教学语义，也不能改变步骤数量。
8. 输出 JSON only。
"""

_REPAIR_PROMPT_TEMPLATE = """\
你需要修复一份没有通过验收的 explainer draft JSON。

【family_hint】{family_hint}
【title】{title}
【summary】{summary}
【prompt_digest】{prompt_digest}
【current_draft】
{current_draft_json}

【validation_errors】
{validation_errors_json}

【canonical_seed】
{seed_draft_json}

{contract_prompt}

修复规则：
1. 只输出一个严格 JSON object，必须匹配 explainer_draft.v1。
2. 只能修正缺字段、空字符串、错误字段、step_captions 数量错误、action_hints 数量错误。
3. 不允许改变步骤数量，不允许改变原始教学语义。
4. 不允许输出完整 runtime graph，不允许输出 component_code。
5. 输出 JSON only。
"""


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _extract_json(raw: str) -> dict[str, Any] | None:
    cleaned = re.sub(r"```(?:json|javascript)?", "", raw).strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        parsed = None
    if isinstance(parsed, dict):
        return parsed
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if not match:
        return None
    try:
        extracted = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return extracted if isinstance(extracted, dict) else None


def resolve_runtime_model_meta() -> dict[str, str]:
    model = _resolve_model_name(
        os.getenv("ANIMATION_RUNTIME_MODEL")
        or os.getenv("LARGE_MODEL")
        or os.getenv("DEFAULT_MODEL")
        or "qwen3.6-flash"
    )
    return {
        "runtime_model": model,
        "runtime_provider": model.split("/", 1)[0] if "/" in model else "unknown",
    }


def resolve_runtime_repair_model_meta() -> dict[str, str]:
    model = _resolve_model_name(
        os.getenv("ANIMATION_RUNTIME_REPAIR_MODEL")
        or os.getenv("ANIMATION_RUNTIME_MODEL")
        or os.getenv("LARGE_MODEL")
        or os.getenv("DEFAULT_MODEL")
        or "qwen3.6-flash"
    )
    return {
        "runtime_model": model,
        "runtime_provider": model.split("/", 1)[0] if "/" in model else "unknown",
    }


def _build_generation_prompt(
    content: dict[str, Any],
    *,
    family_hint: str,
    prompt_digest: str,
) -> tuple[str, str]:
    scene_outline = content.get("scene_outline") or content.get("scenes") or []
    steps = content.get("steps") or []
    seed_draft = build_explainer_draft_seed(content, family_hint)
    return _SYSTEM_PROMPT, _USER_PROMPT_TEMPLATE.format(
        family_hint=family_hint,
        title=_clean_text(content.get("title") or "教学动画"),
        summary=_clean_text(content.get("summary")),
        topic=_clean_text(content.get("topic")),
        focus=_clean_text(content.get("focus")),
        duration_seconds=int(content.get("duration_seconds") or 6),
        rhythm=_clean_text(content.get("rhythm") or "balanced"),
        style_pack=_clean_text(
            content.get("style_pack") or "teaching_ppt_minimal_gray"
        ),
        prompt_digest=prompt_digest,
        scene_outline_json=json.dumps(scene_outline, ensure_ascii=False, indent=2),
        steps_json=json.dumps(steps, ensure_ascii=False, indent=2),
        contract_prompt=build_runtime_contract_prompt_fragment(),
        seed_draft_json=json.dumps(seed_draft, ensure_ascii=False, indent=2),
    )


def _build_repair_prompt(
    content: dict[str, Any],
    *,
    family_hint: str,
    prompt_digest: str,
    current_draft: dict[str, Any],
    validation_errors: list[dict[str, Any]],
) -> tuple[str, str]:
    seed_draft = build_explainer_draft_seed(content, family_hint)
    return _SYSTEM_PROMPT, _REPAIR_PROMPT_TEMPLATE.format(
        family_hint=family_hint,
        title=_clean_text(content.get("title") or "教学动画"),
        summary=_clean_text(content.get("summary")),
        prompt_digest=prompt_digest,
        current_draft_json=json.dumps(current_draft, ensure_ascii=False, indent=2),
        validation_errors_json=json.dumps(
            validation_errors, ensure_ascii=False, indent=2
        ),
        seed_draft_json=json.dumps(seed_draft, ensure_ascii=False, indent=2),
        contract_prompt=build_runtime_contract_prompt_fragment(),
    )


def _build_request_kwargs(
    model: str,
    *,
    system_prompt: str,
    user_prompt: str,
) -> dict[str, Any]:
    request_kwargs: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": 14000,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "explainer_draft_v1",
                "schema": ExplainerDraftV1.model_json_schema(),
                "strict": True,
            },
        },
    }

    if model.startswith("dashscope/"):
        request_kwargs["extra_body"] = {
            "result_format": "message",
            "enable_thinking": False,
        }
    return request_kwargs


async def _call_llm_for_draft(
    system_prompt: str,
    user_prompt: str,
    *,
    repair: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    runtime_meta: dict[str, Any] = (
        resolve_runtime_repair_model_meta() if repair else resolve_runtime_model_meta()
    )
    model = str(runtime_meta["runtime_model"])
    timeout = float(os.getenv("AI_REQUEST_TIMEOUT_SECONDS", "60"))
    request_kwargs = _build_request_kwargs(
        model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
    )

    response = await asyncio.wait_for(acompletion(**request_kwargs), timeout=timeout)
    choice = response.choices[0]
    message = choice.message
    content = message.content or ""
    if isinstance(content, list):
        content = " ".join(
            item.get("text", "") for item in content if isinstance(item, dict)
        )
    parsed = _extract_json(str(content).strip()) or {}
    runtime_meta = {
        **runtime_meta,
        "finish_reason": getattr(choice, "finish_reason", None),
        "has_reasoning_content": bool(
            getattr(message, "reasoning_content", None)
            or getattr(
                getattr(message, "provider_specific_fields", {}),
                "get",
                lambda _k, _d=None: None,
            )("reasoning_content")
        ),
        "raw_content_length": len(str(content)),
        "schema_mode": "json_schema",
    }
    return parsed, runtime_meta


async def generate_animation_runtime_plan_with_llm(
    content: dict[str, Any],
    *,
    family_hint: str,
    prompt_digest: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    system_prompt, user_prompt = _build_generation_prompt(
        content,
        family_hint=family_hint,
        prompt_digest=prompt_digest,
    )
    draft, meta = await _call_llm_for_draft(system_prompt, user_prompt)
    if not draft:
        logger.warning("animation_runtime_llm: failed to extract explainer draft JSON")
    return draft, meta


async def repair_animation_runtime_plan_with_llm(
    content: dict[str, Any],
    *,
    family_hint: str,
    prompt_digest: str,
    current_plan: dict[str, Any],
    validation_errors: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    system_prompt, user_prompt = _build_repair_prompt(
        content,
        family_hint=family_hint,
        prompt_digest=prompt_digest,
        current_draft=current_plan,
        validation_errors=validation_errors,
    )
    draft, meta = await _call_llm_for_draft(system_prompt, user_prompt, repair=True)
    if not draft:
        logger.warning(
            "animation_runtime_llm: failed to extract repaired explainer draft JSON"
        )
    return draft, meta
