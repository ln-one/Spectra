"""Session runtime recovery and idempotency guard."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

from services.platform.generation_event_constants import GenerationEventType
from services.platform.recovery_constants import RecoveryErrorCode, RecoveryStateReason
from services.platform.state_transition_guard import GenerationState

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from services.prisma_runtime import ensure_generated_prisma_client_path

    ensure_generated_prisma_client_path()

    from prisma import Prisma
else:
    Prisma = Any


STALE_PROCESSING_THRESHOLD_MINUTES = 30
_ACTIVE_SESSION_STATES = {
    GenerationState.ANALYZING.value,
    GenerationState.DRAFTING_OUTLINE.value,
    GenerationState.GENERATING_CONTENT.value,
    GenerationState.RENDERING.value,
}


class TaskRecoveryService:
    """Recover stale in-flight sessions and guard duplicate execution commands."""

    def __init__(self, db: Prisma):
        self._db = db

    async def recover_stale_tasks(self, dry_run: bool = False) -> dict:
        threshold = datetime.now(timezone.utc) - timedelta(
            minutes=STALE_PROCESSING_THRESHOLD_MINUTES
        )
        stale_sessions = await self._db.generationsession.find_many(
            where={
                "state": {"in": sorted(_ACTIVE_SESSION_STATES)},
                "updatedAt": {"lt": threshold},
            }
        )

        scanned = len(stale_sessions)
        recovered = 0
        session_updated = 0

        for session in stale_sessions:
            logger.warning(
                (
                    "Stale generation session detected: "
                    "id=%s project=%s state=%s updatedAt=%s"
                ),
                session.id,
                session.projectId,
                session.state,
                session.updatedAt,
            )
            recovered += 1
            if dry_run:
                continue

            await self._db.generationsession.update(
                where={"id": session.id},
                data={
                    "state": GenerationState.FAILED.value,
                    "stateReason": RecoveryStateReason.WORKER_INTERRUPTED.value,
                    "resumable": True,
                    "errorCode": RecoveryErrorCode.WORKER_INTERRUPTED.value,
                    "errorMessage": "执行进程中断，可通过恢复继续。",
                    "errorRetryable": True,
                },
            )
            cursor = str(uuid.uuid4())
            await self._db.sessionevent.create(
                data={
                    "sessionId": session.id,
                    "eventType": GenerationEventType.TASK_FAILED.value,
                    "state": GenerationState.FAILED.value,
                    "stateReason": RecoveryStateReason.WORKER_INTERRUPTED.value,
                    "cursor": cursor,
                    "payload": json.dumps(
                        {
                            "reason": RecoveryErrorCode.WORKER_INTERRUPTED.value,
                            "retryable": True,
                        }
                    ),
                    "schemaVersion": 1,
                }
            )
            await self._db.generationsession.update(
                where={"id": session.id},
                data={"lastCursor": cursor},
            )
            session_updated += 1

        logger.info(
            "TaskRecovery: scanned=%d recovered=%d session_updated=%d dry_run=%s",
            scanned,
            recovered,
            session_updated,
            dry_run,
        )
        return {
            "scanned": scanned,
            "recovered": recovered,
            "session_updated": session_updated,
        }

    async def is_session_already_running(self, session_id: str) -> bool:
        session = await self._db.generationsession.find_unique(where={"id": session_id})
        if session is None:
            return False
        return str(getattr(session, "state", "") or "") in _ACTIVE_SESSION_STATES
