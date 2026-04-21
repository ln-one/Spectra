"""Session runtime recovery and idempotency guard."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

from services.generation_session_service.run_constants import (
    RUN_STATUS_COMPLETED,
    RUN_STATUS_PROCESSING,
    RUN_STEP_COMPLETED,
)
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

    async def _get_latest_session_run(self, session_id: str):
        run_model = getattr(self._db, "sessionrun", None)
        if run_model is None or not hasattr(run_model, "find_first"):
            return None
        try:
            return await run_model.find_first(
                where={"sessionId": session_id},
                order={"createdAt": "desc"},
            )
        except Exception as exc:
            logger.warning(
                "Skip latest SessionRun lookup for recovery: session=%s error=%s",
                session_id,
                exc,
            )
            return None

    @staticmethod
    def _session_has_materialized_output(session: Any) -> bool:
        return bool(
            str(getattr(session, "pptUrl", "") or "").strip()
            or str(getattr(session, "wordUrl", "") or "").strip()
        )

    @staticmethod
    def _is_stale_timestamp(updated_at: Any) -> bool:
        if not isinstance(updated_at, datetime):
            return False
        normalized = (
            updated_at.replace(tzinfo=timezone.utc)
            if updated_at.tzinfo is None
            else updated_at.astimezone(timezone.utc)
        )
        threshold = datetime.now(timezone.utc) - timedelta(
            minutes=STALE_PROCESSING_THRESHOLD_MINUTES
        )
        return normalized < threshold

    async def _repair_stale_processing_run(
        self,
        *,
        session_id: str,
        latest_run: Any,
        session: Any | None = None,
    ) -> bool:
        if latest_run is None:
            return False
        run_status = str(getattr(latest_run, "status", "") or "").strip().lower()
        if run_status != RUN_STATUS_PROCESSING:
            return False
        if not self._is_stale_timestamp(getattr(latest_run, "updatedAt", None)):
            return False
        if session is None:
            session = await self._db.generationsession.find_unique(
                where={"id": session_id}
            )
        if session is None or not self._session_has_materialized_output(session):
            return False
        await self._db.sessionrun.update(
            where={"id": latest_run.id},
            data={
                "status": RUN_STATUS_COMPLETED,
                "step": RUN_STEP_COMPLETED,
            },
        )
        logger.info(
            "Repaired stale processing SessionRun with existing output: session=%s run=%s",
            session_id,
            getattr(latest_run, "id", None),
        )
        return True

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
        run_repaired = 0

        for session in stale_sessions:
            latest_run = await self._get_latest_session_run(session.id)
            if self._session_has_materialized_output(session):
                if (
                    not dry_run
                    and await self._repair_stale_processing_run(
                        session_id=session.id,
                        latest_run=latest_run,
                        session=session,
                    )
                ):
                    run_repaired += 1
                logger.info(
                    "Skip stale-session recovery for materialized output: id=%s",
                    session.id,
                )
                continue
            if (
                latest_run is not None
                and str(getattr(latest_run, "status", "") or "").strip().lower()
                != RUN_STATUS_PROCESSING
            ):
                logger.info(
                    "Skip stale-session recovery for non-processing run: id=%s run=%s status=%s",
                    session.id,
                    getattr(latest_run, "id", None),
                    getattr(latest_run, "status", None),
                )
                continue
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
            "TaskRecovery: scanned=%d recovered=%d session_updated=%d run_repaired=%d dry_run=%s",
            scanned,
            recovered,
            session_updated,
            run_repaired,
            dry_run,
        )
        return {
            "scanned": scanned,
            "recovered": recovered,
            "session_updated": session_updated,
            "run_repaired": run_repaired,
        }

    async def is_session_already_running(self, session_id: str) -> bool:
        latest_run = await self._get_latest_session_run(session_id)
        if latest_run is not None:
            if await self._repair_stale_processing_run(
                session_id=session_id,
                latest_run=latest_run,
            ):
                return False
            return (
                str(getattr(latest_run, "status", "") or "").strip().lower()
                == RUN_STATUS_PROCESSING
            )
        session = await self._db.generationsession.find_unique(where={"id": session_id})
        if session is None:
            return False
        return str(getattr(session, "state", "") or "") in _ACTIVE_SESSION_STATES
