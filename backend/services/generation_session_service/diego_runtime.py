from __future__ import annotations

import json
import os
from typing import Any

from services.diego_client import build_diego_client, diego_enabled
from services.generation_session_service.background_tasks import spawn_background_task
from services.generation_session_service.constants import SessionLifecycleReason
from services.generation_session_service.run_lifecycle import update_session_run
from services.generation_session_service.run_serialization import serialize_session_run
from services.platform.state_transition_guard import GenerationState
from utils.exceptions import APIException, ErrorCode

from .diego_runtime_helpers import (
    build_diego_binding,
    build_diego_create_payload,
    convert_spectra_outline_to_diego,
    get_diego_binding_from_options,
    normalize_mode,
    normalize_style_preset,
    normalize_visual_policy,
    parse_options,
)
from .diego_runtime_state import set_session_state
from .diego_runtime_sync import (
    sync_diego_generation_until_terminal,
    sync_diego_outline_until_ready,
)

_DIEGO_BINDING_KEY = "diego"


def _poll_interval_seconds() -> float:
    raw = os.getenv("DIEGO_POLL_INTERVAL_SECONDS", "").strip()
    if not raw:
        return 2.0
    try:
        return max(0.5, float(raw))
    except ValueError:
        return 2.0


def _outline_sync_timeout_seconds() -> float:
    raw = os.getenv("DIEGO_OUTLINE_SYNC_TIMEOUT_SECONDS", "").strip()
    if not raw:
        return 420.0
    try:
        return max(30.0, float(raw))
    except ValueError:
        return 420.0


def _generation_sync_timeout_seconds() -> float:
    raw = os.getenv("DIEGO_GENERATION_SYNC_TIMEOUT_SECONDS", "").strip()
    if not raw:
        return 7200.0
    try:
        return max(60.0, float(raw))
    except ValueError:
        return 7200.0


def should_use_diego_for_courseware(*, card_id: str) -> bool:
    return card_id == "courseware_ppt" and diego_enabled()


async def start_diego_outline_workflow(
    *,
    db,
    session_id: str,
    run,
    options: dict[str, Any],
) -> dict[str, Any]:
    client = build_diego_client()
    if client is None:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="Diego 未启用或配置缺失（请检查 DIEGO_ENABLED / DIEGO_BASE_URL）",
        )
    if run is None or not getattr(run, "id", None):
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="课程 run 尚未建立，无法绑定 Diego 任务",
        )

    create_payload = build_diego_create_payload(
        options=options,
        diego_project_id=run.id,
    )
    response = await client.create_run(create_payload)
    diego_run_id = str(response.get("run_id") or "").strip()
    if not diego_run_id:
        raise APIException(
            status_code=502,
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            message="Diego create_run 未返回 run_id",
        )
    diego_trace_id = str(response.get("trace_id") or "").strip() or None
    binding = build_diego_binding(
        diego_project_id=run.id,
        diego_run_id=diego_run_id,
        diego_trace_id=diego_trace_id or "",
        run=run,
        mode=normalize_mode(options.get("generation_mode")),
        style_preset=normalize_style_preset(options.get("style_preset")),
        visual_policy=normalize_visual_policy(options.get("visual_policy")),
        template_id=str(options.get("template_id") or "").strip() or None,
    )

    next_options = dict(options)
    next_options[_DIEGO_BINDING_KEY] = binding
    await db.generationsession.update(
        where={"id": session_id},
        data={"options": json.dumps(next_options, ensure_ascii=False)},
    )

    spawn_background_task(
        sync_diego_outline_until_ready(
            db=db,
            session_id=session_id,
            spectra_run_id=run.id,
            diego_run_id=diego_run_id,
            diego_trace_id=diego_trace_id,
            poll_interval_seconds=_poll_interval_seconds(),
            timeout_seconds=_outline_sync_timeout_seconds(),
        ),
        label=f"diego-outline-sync:{session_id}:{run.id}",
    )
    return binding


async def confirm_diego_outline_for_session(
    *,
    db,
    session,
    run,
    command: dict[str, Any],
) -> dict[str, Any]:
    if run is None or not getattr(run, "id", None):
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="当前会话 Diego 绑定缺少 Spectra run 上下文",
        )
    options = parse_options(getattr(session, "options", None))
    binding = get_diego_binding_from_options(options)
    if binding is None:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="当前会话未绑定 Diego run，无法执行 Diego confirm 流程",
        )

    diego_run_id = str(binding.get("diego_run_id") or "").strip()
    if not diego_run_id:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="当前会话 Diego run_id 缺失",
        )
    client = build_diego_client()
    if client is None:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="Diego 未启用或配置缺失（请检查 DIEGO_ENABLED / DIEGO_BASE_URL）",
        )

    confirm_payload: dict[str, Any] = {"approved": True}
    command_outline = command.get("outline")
    if isinstance(command_outline, dict):
        confirm_payload["outline"] = convert_spectra_outline_to_diego(command_outline)
        base_version = command.get("base_version")
        try:
            parsed_base_version = int(base_version)
        except (TypeError, ValueError):
            parsed_base_version = int(command_outline.get("version") or 0)
        if parsed_base_version < 1:
            parsed_base_version = 1
        confirm_payload["base_version"] = parsed_base_version
        change_reason = str(command.get("change_reason") or "").strip()
        if change_reason:
            confirm_payload["change_reason"] = change_reason

    await client.confirm_outline(diego_run_id, confirm_payload)
    await update_session_run(
        db=db,
        run_id=run.id,
        status="processing",
        step="generate",
    )
    payload = {
        "reason": SessionLifecycleReason.OUTLINE_CONFIRMED.value,
        "run_id": run.id,
        "run_no": run.runNo,
        "run_title": run.title,
        "tool_type": run.toolType,
        "diego_run_id": diego_run_id,
        "diego_trace_id": binding.get("diego_trace_id"),
    }
    await set_session_state(
        db=db,
        session_id=session.id,
        state=GenerationState.GENERATING_CONTENT.value,
        state_reason=SessionLifecycleReason.OUTLINE_CONFIRMED.value,
        progress=45,
        payload=payload,
    )

    spawn_background_task(
        sync_diego_generation_until_terminal(
            db=db,
            session_id=session.id,
            run=run,
            diego_run_id=diego_run_id,
            diego_trace_id=str(binding.get("diego_trace_id") or "").strip() or None,
            poll_interval_seconds=_poll_interval_seconds(),
            timeout_seconds=_generation_sync_timeout_seconds(),
        ),
        label=f"diego-generation-sync:{session.id}:{run.id}",
    )
    return {"run": serialize_session_run(run)}
