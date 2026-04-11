from __future__ import annotations

import asyncio
from typing import Optional

from services.generation_session_service.access import get_owned_session
from services.generation_session_service.serialization_helpers import (
    _to_generation_event,
)
from services.generation_session_service.session_artifacts import (
    get_session_artifact_history,
)
from services.generation_session_service.snapshot_assembly import (
    build_session_snapshot_payload,
)
from services.generation_session_service.snapshot_consistency import (
    validate_session_snapshot_contract,
)
from services.generation_session_service.snapshot_outline_queries import (
    load_latest_outline,
)
from services.generation_session_service.snapshot_parsing import parse_json_object
from services.generation_session_service.snapshot_runtime_queries import (
    build_snapshot_result,
    load_snapshot_runtime_components,
    serialize_current_run,
)
from services.generation_session_service.snapshot_state_queries import (
    load_latest_state_event,
    load_session_fallbacks,
)


async def get_session_snapshot(
    *,
    db,
    guard,
    session_id: str,
    user_id: str,
    contract_version: str,
    schema_version: int,
    run_id: Optional[str] = None,
) -> dict:
    session = await get_owned_session(
        db=db,
        session_id=session_id,
        user_id=user_id,
    )

    outline, runtime_components, latest_state_event = await asyncio.gather(
        load_latest_outline(db, session, run_id),
        load_snapshot_runtime_components(db=db, session=session, run_id=run_id),
        load_latest_state_event(db, session.id, run_id),
    )

    snapshot = build_session_snapshot_payload(
        session=session,
        contract_version=contract_version,
        schema_version=schema_version,
        guard=guard,
        outline=outline,
        fallbacks=load_session_fallbacks(session),
        artifact_history=runtime_components["artifact_history"],
        latest_candidate_change=runtime_components["latest_candidate_change"],
        current_run=serialize_current_run(runtime_components["current_run"]),
        result=build_snapshot_result(session),
    )
    snapshot["options"] = parse_json_object(getattr(session, "options", None))

    validate_session_snapshot_contract(
        session=session,
        snapshot=snapshot,
        latest_state_event=latest_state_event,
    )
    return snapshot


async def get_session_runtime_state(
    *,
    db,
    session_id: str,
    user_id: str,
) -> dict:
    session = await get_owned_session(
        db=db,
        session_id=session_id,
        user_id=user_id,
        select={"userId": True, "state": True, "lastCursor": True, "updatedAt": True},
    )

    state = session.get("state") if isinstance(session, dict) else session.state
    last_cursor = (
        session.get("lastCursor") if isinstance(session, dict) else session.lastCursor
    )
    updated_at = (
        session.get("updatedAt") if isinstance(session, dict) else session.updatedAt
    )
    return {
        "state": state,
        "last_cursor": last_cursor,
        "updated_at": updated_at,
    }


async def get_events(
    *,
    db,
    session_id: str,
    user_id: str,
    cursor: Optional[str] = None,
    limit: int = 50,
) -> list[dict]:
    await get_owned_session(db=db, session_id=session_id, user_id=user_id)

    where: dict = {"sessionId": session_id}
    if cursor:
        pivot = await db.sessionevent.find_unique(where={"cursor": cursor})
        if pivot and getattr(pivot, "sessionId", None) == session_id:
            where["createdAt"] = {"gt": pivot.createdAt}

    events = await db.sessionevent.find_many(
        where=where,
        order={"createdAt": "asc"},
        take=limit,
    )

    return [_to_generation_event(e) for e in events]
