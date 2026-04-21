from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from services.ai import acompletion, ai_service
from services.ai.model_resolution import _resolve_model_name
from services.ai.model_router import ModelRouteTask
from services.ai.service_support import resolve_requested_model

from .structured_prompting import build_structured_title_system_prompt

logger = logging.getLogger(__name__)

TitleScene = Literal["project", "session", "run"]
TITLE_RESPONSE_MAX_TOKENS = 5120


class StructuredTitleArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=64)
    basis_key: str = Field(min_length=1, max_length=64)
    scene: TitleScene


class StructuredTitleFormatError(ValueError):
    """Raised when the model response is complete but not structurally usable."""


@dataclass(frozen=True)
class StructuredTitleResult:
    title: str
    basis_key: str
    scene: TitleScene
    model: str
    latency_ms: float


def _build_request_kwargs(
    *,
    model: str,
    scene: TitleScene,
    payload: dict[str, Any],
) -> dict[str, Any]:
    request_kwargs: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": build_structured_title_system_prompt(scene)},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        "temperature": 0,
        "max_tokens": TITLE_RESPONSE_MAX_TOKENS,
        "max_retries": 0,
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "set_title",
                    "description": "返回一个有效的中文标题结果。",
                    "parameters": StructuredTitleArguments.model_json_schema(),
                },
            }
        ],
        "tool_choice": {"type": "function", "function": {"name": "set_title"}},
    }
    if model.startswith("dashscope/"):
        request_kwargs["extra_body"] = {
            "result_format": "message",
            "enable_thinking": False,
        }
    return request_kwargs


def _extract_tool_arguments(message: Any) -> dict[str, Any]:
    tool_calls = getattr(message, "tool_calls", None) or []
    for item in tool_calls:
        function_payload = getattr(item, "function", None)
        if function_payload is None and isinstance(item, dict):
            function_payload = item.get("function")
        if function_payload is None:
            continue
        arguments = getattr(function_payload, "arguments", None)
        if arguments is None and isinstance(function_payload, dict):
            arguments = function_payload.get("arguments")
        if isinstance(arguments, dict):
            return _coerce_tool_arguments(arguments)
        if isinstance(arguments, str) and arguments.strip():
            parsed = json.loads(arguments)
            if isinstance(parsed, dict):
                return _coerce_tool_arguments(parsed)

    content = getattr(message, "content", None)
    if isinstance(content, str):
        parsed_from_content = _extract_arguments_from_content(content)
        if parsed_from_content:
            return parsed_from_content
    raise StructuredTitleFormatError("structured_title_missing_tool_arguments")


TOOL_CALLS_RE = re.compile(r"<tool_calls>\s*(.*?)\s*</tool_calls>", re.DOTALL)


def _coerce_tool_arguments(payload: dict[str, Any]) -> dict[str, Any]:
    if {"title", "basis_key", "scene"}.issubset(payload):
        return payload

    function_payload = payload.get("function")
    if isinstance(function_payload, dict):
        arguments = function_payload.get("arguments")
        if isinstance(arguments, dict):
            return arguments
        if isinstance(arguments, str) and arguments.strip():
            parsed = json.loads(arguments)
            if isinstance(parsed, dict):
                return parsed

    arguments = payload.get("arguments")
    if isinstance(arguments, dict):
        return arguments
    if isinstance(arguments, str) and arguments.strip():
        parsed = json.loads(arguments)
        if isinstance(parsed, dict):
            return parsed

    raise StructuredTitleFormatError("structured_title_invalid_tool_payload")


def _iter_json_values(text: str) -> list[Any]:
    decoder = json.JSONDecoder()
    values: list[Any] = []
    cursor = 0
    while cursor < len(text):
        while cursor < len(text) and text[cursor].isspace():
            cursor += 1
        if cursor >= len(text):
            break
        try:
            value, end = decoder.raw_decode(text, cursor)
        except json.JSONDecodeError:
            next_line = text.find("\n", cursor)
            if next_line < 0:
                break
            cursor = next_line + 1
            continue
        values.append(value)
        cursor = end
    return values


def _extract_arguments_from_content(content: str) -> dict[str, Any] | None:
    text = content.strip()
    if not text:
        return None

    for match in TOOL_CALLS_RE.finditer(text):
        for value in _iter_json_values(match.group(1)):
            if isinstance(value, dict):
                try:
                    return _coerce_tool_arguments(value)
                except StructuredTitleFormatError:
                    continue
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        try:
                            return _coerce_tool_arguments(item)
                        except StructuredTitleFormatError:
                            continue

    if text.startswith("{"):
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return _coerce_tool_arguments(parsed)
    return None


async def generate_structured_title(
    *,
    scene: TitleScene,
    payload: dict[str, Any],
    entity_id: str,
) -> StructuredTitleResult:
    prompt_hint = json.dumps(payload, ensure_ascii=False)
    route_decision, requested_model, _ = resolve_requested_model(
        model_router=ai_service.model_router,
        default_model=ai_service.default_model,
        model=None,
        route_task=ModelRouteTask.TITLE_POLISH.value,
        prompt=prompt_hint,
        has_rag_context=False,
    )
    resolved_model = _resolve_model_name(requested_model)
    timeout_seconds = ai_service._resolve_timeout_seconds(ModelRouteTask.TITLE_POLISH)
    request_kwargs = _build_request_kwargs(
        model=resolved_model,
        scene=scene,
        payload=payload,
    )
    logger.info(
        "structured_title.requested scene=%s entity_id=%s model=%s route_reason=%s",
        scene,
        entity_id,
        resolved_model,
        getattr(route_decision, "reason", None),
    )

    started_at = time.perf_counter()
    last_exc: Exception | None = None
    attempts = 1
    for attempt in range(1, attempts + 1):
        if attempt > 1:
            await asyncio.sleep(max(0.0, ai_service.upstream_retry_delay_seconds))
        try:
            response = await asyncio.wait_for(
                acompletion(**request_kwargs),
                timeout=timeout_seconds,
            )
            message = response.choices[0].message
            parsed = StructuredTitleArguments.model_validate(
                _extract_tool_arguments(message)
            )
            latency_ms = round((time.perf_counter() - started_at) * 1000.0, 2)
            logger.info(
                "structured_title.accepted scene=%s entity_id=%s model=%s basis_key=%s latency_ms=%s",
                scene,
                entity_id,
                resolved_model,
                parsed.basis_key,
                latency_ms,
            )
            return StructuredTitleResult(
                title=parsed.title,
                basis_key=parsed.basis_key,
                scene=parsed.scene,
                model=resolved_model,
                latency_ms=latency_ms,
            )
        except Exception as exc:
            last_exc = exc
            break

    logger.warning(
        "structured_title.rejected scene=%s entity_id=%s model=%s error=%s",
        scene,
        entity_id,
        resolved_model,
        last_exc,
    )
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("structured_title_unreachable")
