from __future__ import annotations

from datetime import datetime, timezone
from typing import Awaitable, Callable

from services.generation_session_service.diego_runtime import (
    confirm_diego_outline_for_session,
)
from services.generation_session_service.diego_runtime_helpers import (
    get_session_diego_binding,
)
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
)
from services.generation_session_service.session_history import (
    RUN_STATUS_PENDING,
    RUN_STEP_CONFIG,
    RUN_STEP_GENERATE,
    RUN_STEP_OUTLINE,
    SESSION_TITLE_SOURCE_MANUAL,
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
    raise conflict_error_cls(
        "REDRAFT_OUTLINE 已下线，请返回配置页重新发起 Diego 课件流程。",
        details={"reason": "legacy_redraft_removed"},
    )


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

    if get_session_diego_binding(session):
        return await confirm_diego_outline_for_session(
            db=db,
            session=session,
            run=run,
            command=command,
        )
    raise conflict_error_cls(
        "旧版 PPT 生成链路已下线，请通过 Diego 会话重新发起。",
        details={
            "reason": "legacy_ppt_flow_removed",
            "session_id": session.id,
            "run_id": getattr(run, "id", None),
        },
    )


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
