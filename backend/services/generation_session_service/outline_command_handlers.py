from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Awaitable, Callable

from schemas.generation import TaskStatus
from services.generation_session_service.capability_helpers import _normalize_task_type
from services.generation_session_service.constants import SessionLifecycleReason
from services.generation_session_service.outline_versions import (
    get_effective_outline_version,
    load_latest_outline_record,
    normalize_outline_document,
    parse_outline_json,
    persist_outline_version,
)
from services.generation_session_service.run_queries import (
    get_latest_active_session_run,
    get_latest_active_session_run_by_tool,
    get_session_run,
    resolve_output_tool_type,
)
from services.generation_session_service.session_history import (
    RUN_STATUS_PENDING,
    RUN_STATUS_PROCESSING,
    RUN_STEP_CONFIG,
    RUN_STEP_GENERATE,
    RUN_STEP_OUTLINE,
    SESSION_TITLE_SOURCE_MANUAL,
    build_run_prompt_trace_payload,
    build_run_trace_payload,
    create_session_run,
    serialize_session_run,
    update_session_run,
)
from services.platform.generation_event_constants import GenerationEventType


async def handle_update_outline(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event: Callable[..., Awaitable[None]],
    conflict_error_cls,
) -> None:
    base_version = int(command.get("base_version", 0) or 0)
    outline_data = command.get("outline", {}) or {}
    change_reason = command.get("change_reason")
    effective_version = await get_effective_outline_version(db, session)

    if effective_version != base_version:
        latest_outline = await load_latest_outline_record(db, session.id)
        latest_outline_doc = (
            parse_outline_json(getattr(latest_outline, "outlineData", None))
            if latest_outline
            else None
        )
        normalized_existing = (
            normalize_outline_document(latest_outline_doc, latest_outline.version)
            if latest_outline and latest_outline_doc is not None
            else None
        )
        normalized_requested = normalize_outline_document(
            outline_data,
            max(base_version + 1, effective_version),
        )
        if (
            latest_outline
            and latest_outline.version == normalized_requested["version"]
            and normalized_existing == normalized_requested
        ):
            if session.currentOutlineVersion != latest_outline.version:
                await db.generationsession.update(
                    where={"id": session.id},
                    data={
                        "state": new_state,
                        "currentOutlineVersion": latest_outline.version,
                    },
                )
            return
        raise conflict_error_cls(
            f"大纲版本冲突：期望 {base_version}，当前 {effective_version}"
        )

    new_version = effective_version + 1
    await persist_outline_version(
        db=db,
        session_id=session.id,
        version=new_version,
        outline_data=outline_data,
        change_reason=change_reason,
    )
    await db.generationsession.update(
        where={"id": session.id},
        data={
            "state": new_state,
            "currentOutlineVersion": new_version,
            "renderVersion": {"increment": 1},
        },
    )
    await append_event(
        session_id=session.id,
        event_type=GenerationEventType.OUTLINE_UPDATED.value,
        state=new_state,
        payload={"version": new_version, "change_reason": change_reason},
    )


async def handle_redraft_outline(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event: Callable[..., Awaitable[None]],
    conflict_error_cls,
) -> dict:
    instruction = command.get("instruction", "")
    base_version = int(command.get("base_version", 0) or 0)
    requested_run_id = str(command.get("run_id") or "").strip() or None
    effective_version = await get_effective_outline_version(db, session)

    if effective_version != base_version:
        raise conflict_error_cls(
            f"大纲版本冲突：期望 {base_version}，当前 {effective_version}"
        )

    tool_type = resolve_output_tool_type(str(getattr(session, "outputType", "") or ""))
    run = None
    if requested_run_id:
        run = await get_session_run(db, session.id, requested_run_id)
        if not run:
            raise conflict_error_cls("run_id 无效或不属于当前会话")
        if str(getattr(run, "toolType", "") or "") != tool_type:
            raise conflict_error_cls("run_id 与当前课件任务类型不匹配")
    if run is None:
        run = await get_latest_active_session_run_by_tool(
            db,
            session.id,
            tool_type,
        )
    if run is None:
        raise conflict_error_cls(
            "当前会话没有可复用的课件 run，请返回第一步重新创建任务"
        )
    updated_run = await update_session_run(
        db=db,
        run_id=run.id,
        step=RUN_STEP_OUTLINE,
        status=RUN_STATUS_PROCESSING,
    )
    run = updated_run or run
    await db.generationsession.update(
        where={"id": session.id},
        data={"state": new_state, "renderVersion": {"increment": 1}},
    )
    await append_event(
        session_id=session.id,
        event_type=GenerationEventType.STATE_CHANGED.value,
        state=new_state,
        state_reason=getattr(session, "stateReason", None),
        payload=build_run_trace_payload(
            run,
            instruction=instruction,
            base_version=base_version,
        ),
    )
    return {"run": serialize_session_run(run)}


async def handle_confirm_outline(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event: Callable[..., Awaitable[None]],
    conflict_error_cls,
) -> dict:
    expected_state = command.get("expected_state")
    requested_run_id = str(command.get("run_id") or "").strip() or None
    if expected_state and session.state != expected_state:
        raise conflict_error_cls(
            f"Session state mismatch: expected {expected_state}, got {session.state}"
        )
    effective_outline_version = await get_effective_outline_version(db, session)
    if effective_outline_version != getattr(session, "currentOutlineVersion", 0):
        await db.generationsession.update(
            where={"id": session.id},
            data={"currentOutlineVersion": effective_outline_version},
        )

    options: dict = {}
    if session.options:
        try:
            options = json.loads(session.options)
        except (json.JSONDecodeError, TypeError):
            options = {}
    task_type = _normalize_task_type(session.outputType, conflict_error_cls)

    input_payload = {"outline_version": effective_outline_version}
    if options.get("template_config"):
        input_payload["template_config"] = options.get("template_config")
    traceability_payload = build_run_prompt_trace_payload(
        rag_source_ids=(options.get("template_config") or {}).get("rag_source_ids")
    )
    input_payload.update(traceability_payload)

    tool_type = {
        "ppt": "ppt_generate",
        "word": "word_generate",
        "both": "both_generate",
    }.get(str(session.outputType or "").strip().lower(), "both_generate")
    studio_tool_type = {
        "ppt": "studio_card:courseware_ppt",
        "word": "studio_card:word_document",
    }.get(str(session.outputType or "").strip().lower())

    run = None
    if requested_run_id:
        run = await get_session_run(db, session.id, requested_run_id)
        if not run:
            raise conflict_error_cls("run_id 无效或不属于当前会话")
        run_tool_type = str(getattr(run, "toolType", "") or "")
        if run_tool_type not in {tool_type, studio_tool_type}:
            raise conflict_error_cls("run_id 与当前课件任务类型不匹配")
        updated_run = await update_session_run(
            db=db,
            run_id=run.id,
            step=RUN_STEP_GENERATE,
            status=RUN_STATUS_PENDING,
        )
        run = updated_run or run
    else:
        active_session_run = await get_latest_active_session_run(db, session.id)
        if active_session_run and getattr(active_session_run, "step", None) in {
            RUN_STEP_CONFIG,
            RUN_STEP_OUTLINE,
        }:
            active_tool_type = str(getattr(active_session_run, "toolType", "") or "")
            if active_tool_type in {tool_type, studio_tool_type}:
                run = await update_session_run(
                    db=db,
                    run_id=active_session_run.id,
                    step=RUN_STEP_GENERATE,
                    status=RUN_STATUS_PENDING,
                )
                run = run or active_session_run

    if run is None:
        active_outline_run = await get_latest_active_session_run_by_tool(
            db,
            session.id,
            tool_type,
        )
        if (
            active_outline_run
            and getattr(active_outline_run, "step", None) == RUN_STEP_OUTLINE
        ):
            run = await update_session_run(
                db=db,
                run_id=active_outline_run.id,
                step=RUN_STEP_GENERATE,
                status=RUN_STATUS_PENDING,
            )
            run = run or active_outline_run

    if run is None:
        run = await create_session_run(
            db=db,
            session_id=session.id,
            project_id=session.projectId,
            tool_type=tool_type,
            step=RUN_STEP_GENERATE,
            status=RUN_STATUS_PENDING,
        )

    task = await db.generationtask.create(
        data={
            "projectId": session.projectId,
            "sessionId": session.id,
            "taskType": task_type,
            "status": TaskStatus.PENDING,
            "progress": 0,
            "inputData": json.dumps(
                {
                    **input_payload,
                    **(
                        {
                            "run_id": run.id,
                            "run_no": run.runNo,
                            "run_title": run.title,
                            "tool_type": run.toolType,
                        }
                        if run
                        else {}
                    ),
                }
            ),
        }
    )

    await db.generationsession.update(
        where={"id": session.id},
        data={
            "state": new_state,
            "stateReason": SessionLifecycleReason.OUTLINE_CONFIRMED.value,
            "errorCode": None,
            "errorMessage": None,
            "errorRetryable": False,
            "renderVersion": {"increment": 1},
            "resumable": True,
        },
    )
    await append_event(
        session_id=session.id,
        event_type=GenerationEventType.STATE_CHANGED.value,
        state=new_state,
        state_reason=SessionLifecycleReason.OUTLINE_CONFIRMED.value,
        payload=build_run_trace_payload(
            run,
            confirmed=True,
            task_id=task.id,
            reason=SessionLifecycleReason.OUTLINE_CONFIRMED.value,
            **traceability_payload,
        ),
    )
    return {"task_id": task.id, "run": serialize_session_run(run)}


async def handle_set_session_title(
    *,
    db,
    session,
    command: dict,
) -> None:
    display_title = str(command.get("display_title") or "").strip()
    await db.generationsession.update(
        where={"id": session.id},
        data={
            "displayTitle": display_title[:120],
            "displayTitleSource": SESSION_TITLE_SOURCE_MANUAL,
            "displayTitleUpdatedAt": datetime.now(timezone.utc),
        },
    )
