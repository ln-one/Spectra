from __future__ import annotations

import asyncio
import json
from typing import Optional

from services.generation_session_service.access import get_owned_session
from services.generation_session_service.serialization_helpers import (
    _to_generation_event,
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
        enforce_state_event_consistency=run_id is None,
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
    run_id: Optional[str] = None,
) -> list[dict]:
    await get_owned_session(db=db, session_id=session_id, user_id=user_id)

    def _normalize_run_id(value: Optional[str]) -> Optional[str]:
        normalized = (value or "").strip()
        return normalized or None

    def _extract_run_id_from_event_payload(payload_raw: object) -> Optional[str]:
        if not payload_raw:
            return None
        payload: dict | None = None
        if isinstance(payload_raw, str):
            try:
                parsed = json.loads(payload_raw)
            except json.JSONDecodeError:
                return None
            if isinstance(parsed, dict):
                payload = parsed
        elif isinstance(payload_raw, dict):
            payload = payload_raw
        if payload is None:
            return None

        direct_run_id = _normalize_run_id(payload.get("run_id"))
        if direct_run_id:
            return direct_run_id

        section_payload = payload.get("section_payload")
        if isinstance(section_payload, dict):
            section_run_id = _normalize_run_id(section_payload.get("run_id"))
            if section_run_id:
                return section_run_id

        run_payload = payload.get("run")
        if isinstance(run_payload, dict):
            nested_run_id = _normalize_run_id(run_payload.get("run_id"))
            if nested_run_id:
                return nested_run_id

        return None

    def _event_matches_run_id(event, expected_run_id: str) -> bool:
        event_run_id = _extract_run_id_from_event_payload(getattr(event, "payload", None))
        return event_run_id == expected_run_id

    where: dict = {"sessionId": session_id}
    if cursor:
        pivot = await db.sessionevent.find_unique(where={"cursor": cursor})
        if pivot and getattr(pivot, "sessionId", None) == session_id:
            where["createdAt"] = {"gt": pivot.createdAt}

    normalized_run_id = _normalize_run_id(run_id)
    if not normalized_run_id:
        events = await db.sessionevent.find_many(
            where=where,
            order={"createdAt": "asc"},
            take=limit,
        )
        return [_to_generation_event(e) for e in events]

    filtered_events = []
    fetch_size = min(max(limit * 4, 50), 500)
    page_where = dict(where)

    while len(filtered_events) < limit:
        events = await db.sessionevent.find_many(
            where=page_where,
            order={"createdAt": "asc"},
            take=fetch_size,
        )
        if not events:
            break

        for event in events:
            if _event_matches_run_id(event, normalized_run_id):
                filtered_events.append(event)
                if len(filtered_events) >= limit:
                    break

        if len(events) < fetch_size:
            break

        last_event = events[-1]
        last_created_at = getattr(last_event, "createdAt", None)
        if last_created_at is None:
            break
        page_where = {
            "sessionId": session_id,
            "createdAt": {"gt": last_created_at},
        }

    return [_to_generation_event(e) for e in filtered_events[:limit]]
