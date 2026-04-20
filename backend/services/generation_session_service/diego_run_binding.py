from __future__ import annotations

import json
from typing import Any

from utils.exceptions import APIException, ErrorCode, NotFoundException


def parse_options_json(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return dict(raw)
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return dict(parsed) if isinstance(parsed, dict) else {}


async def resolve_run_and_session(*, db, run_id: str, user_id: str):
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
            message="运行缺少会话绑定，无法解析 Diego run",
        )
    session = await db.generationsession.find_unique(where={"id": session_id})
    if not session or str(getattr(session, "userId", "") or "").strip() != user_id:
        raise NotFoundException(
            message=f"运行不存在: {run_id}",
            error_code=ErrorCode.NOT_FOUND,
        )
    return run, session


async def resolve_diego_binding_for_run(
    *,
    db,
    session,
    run,
    parse_options,
    get_diego_binding_from_options,
) -> dict[str, Any]:
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
        payload = parse_options_json(getattr(event, "payload", None))
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
        message="当前运行未绑定 Diego run，无法访问单页编辑能力",
    )
