from __future__ import annotations

import uuid

from services.generation_session_service.serialization_helpers import _to_session_ref
from services.generation_session_service.session_history import (
    get_latest_session_run,
    serialize_session_run,
)


def build_command_response(
    *,
    db,
    session_id: str,
    command_type: str,
    run_data: dict | None,
    result,
    warnings: list[str],
    contract_version: str,
    schema_version: int,
):
    async def _build() -> dict:
        updated_session = await db.generationsession.find_unique(
            where={"id": session_id}
        )
        current_run = run_data
        if current_run is None and command_type != "SET_SESSION_TITLE":
            latest_run = await get_latest_session_run(db, session_id)
            current_run = serialize_session_run(latest_run)
        return {
            "command_id": str(uuid.uuid4()),
            "accepted": True,
            "transition": {
                "command_type": command_type,
                "from_state": result.from_state,
                "to_state": result.to_state,
                "validated_by": result.validated_by,
            },
            "session": _to_session_ref(
                updated_session,
                contract_version,
                schema_version,
            ),
            "run": current_run,
            "warnings": warnings,
        }

    return _build()
