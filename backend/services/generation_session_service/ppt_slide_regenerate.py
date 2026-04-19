from __future__ import annotations

import json
import os
from typing import Any

from services.diego_client import build_diego_client
from services.generation_session_service.background_tasks import spawn_background_task
from services.generation_session_service.diego_runtime_helpers import (
    get_diego_binding_from_options,
    parse_options,
)
from services.generation_session_service.diego_runtime_sync.regenerate_sync import (
    sync_diego_regenerated_slide_until_ready,
)
from services.generation_session_service.run_lifecycle import update_session_run
from utils.exceptions import APIException, ErrorCode, NotFoundException


def _poll_interval_seconds() -> float:
    raw = os.getenv("DIEGO_POLL_INTERVAL_SECONDS", "").strip()
    if not raw:
        return 1.0
    try:
        return max(0.5, float(raw))
    except ValueError:
        return 1.0


def _regenerate_sync_timeout_seconds() -> float:
    raw = os.getenv("DIEGO_REGENERATE_SYNC_TIMEOUT_SECONDS", "").strip()
    if not raw:
        return 900.0
    try:
        return max(30.0, float(raw))
    except ValueError:
        return 900.0


def _parse_json_dict(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return dict(raw)
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return dict(parsed) if isinstance(parsed, dict) else {}


async def _resolve_run_and_session(*, db, run_id: str, user_id: str):
    run = await db.sessionrun.find_unique(where={"id": run_id})
    if not run:
        raise NotFoundException(
            message=f"运行不存在: {run_id}",
            error_code=ErrorCode.NOT_FOUND,
        )
    session_id = str(getattr(run, "sessionId", "") or "").strip()
    if not session_id:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="运行缺少会话绑定，无法执行单页重做",
        )
    session = await db.generationsession.find_unique(where={"id": session_id})
    if not session or str(getattr(session, "userId", "") or "").strip() != user_id:
        raise NotFoundException(
            message=f"运行不存在: {run_id}",
            error_code=ErrorCode.NOT_FOUND,
        )
    return run, session


async def _resolve_diego_binding_for_run(*, db, session, run) -> dict[str, Any]:
    options = parse_options(getattr(session, "options", None))
    binding = get_diego_binding_from_options(options)
    if binding and str(binding.get("spectra_run_id") or "").strip() == str(getattr(run, "id", "") or "").strip():
        return binding

    events = await db.sessionevent.find_many(
        where={"sessionId": session.id},
        order={"createdAt": "desc"},
        take=250,
    )
    run_id = str(getattr(run, "id", "") or "").strip()
    for event in events:
        payload = _parse_json_dict(getattr(event, "payload", None))
        if str(payload.get("run_id") or "").strip() != run_id:
            continue
        diego_run_id = str(payload.get("diego_run_id") or "").strip()
        if not diego_run_id:
            continue
        return {
            "diego_run_id": diego_run_id,
            "diego_trace_id": str(payload.get("diego_trace_id") or "").strip() or None,
            "spectra_run_id": run_id,
        }

    raise APIException(
        status_code=409,
        error_code=ErrorCode.RESOURCE_CONFLICT,
        message="当前运行未绑定 Diego run，无法执行单页重做",
    )


async def regenerate_diego_slide_for_run(
    *,
    db,
    run_id: str,
    slide_no: int,
    instruction: str,
    preserve_style: bool,
    user_id: str,
) -> dict[str, Any]:
    if slide_no < 1:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="slide_no must be >= 1",
        )
    instruction_text = str(instruction or "").strip()
    if not instruction_text:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="instruction is required",
        )

    client = build_diego_client()
    if client is None:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="Diego 未启用或配置缺失（请检查 DIEGO_ENABLED / DIEGO_BASE_URL）",
        )

    run, session = await _resolve_run_and_session(db=db, run_id=run_id, user_id=user_id)
    binding = await _resolve_diego_binding_for_run(db=db, session=session, run=run)
    diego_run_id = str(binding.get("diego_run_id") or "").strip()
    if not diego_run_id:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="当前运行 Diego run_id 缺失",
        )

    detail = await client.get_run(diego_run_id)
    baseline_seq = max(
        (
            int(item.get("seq") or 0)
            for item in (detail.get("events") or [])
            if isinstance(item, dict)
        ),
        default=0,
    )
    result = await client.regenerate_slide(
        diego_run_id,
        slide_no,
        {
            "instruction": instruction_text,
            "preserve_style": bool(preserve_style),
        },
    )
    await update_session_run(
        db=db,
        run_id=run.id,
        status="processing",
        step="generate",
    )
    spawn_background_task(
        sync_diego_regenerated_slide_until_ready(
            db=db,
            session_id=session.id,
            run=run,
            diego_run_id=diego_run_id,
            diego_trace_id=str(binding.get("diego_trace_id") or "").strip() or None,
            slide_no=slide_no,
            baseline_seq=baseline_seq,
            poll_interval_seconds=_poll_interval_seconds(),
            timeout_seconds=_regenerate_sync_timeout_seconds(),
        ),
        label=f"diego-regenerate-sync:{session.id}:{run.id}:{slide_no}",
    )
    return result
