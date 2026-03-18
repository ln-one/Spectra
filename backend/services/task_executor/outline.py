"""Outline draft task workflow."""

import asyncio
import logging
import uuid
from typing import Optional

from .common import run_async_entrypoint

logger = logging.getLogger(__name__)


def run_outline_draft_task(
    session_id: str,
    project_id: str,
    options: Optional[dict] = None,
):
    """Sync wrapper for outline draft task."""
    run_async_entrypoint(
        lambda: execute_outline_draft_task(
            session_id=session_id,
            project_id=project_id,
            options=options,
        )
    )


async def execute_outline_draft_task(
    session_id: str,
    project_id: str,
    options: Optional[dict] = None,
):
    from services.database import DatabaseService
    from services.generation_session_service import GenerationSessionService

    db = DatabaseService()
    db_connected = False
    trace_id = str(uuid.uuid4())

    try:
        await asyncio.wait_for(db.connect(), timeout=10)
        db_connected = True

        svc = GenerationSessionService(db=db.db)
        await svc._execute_outline_draft_local(
            session_id=session_id,
            project_id=project_id,
            options=options,
            trace_id=trace_id,
        )

        logger.info(
            "Outline draft task completed: session=%s trace_id=%s",
            session_id,
            trace_id,
        )
    except Exception as exc:
        logger.error(
            "Outline draft task failed: session=%s trace_id=%s error=%s",
            session_id,
            trace_id,
            exc,
            exc_info=True,
        )
        raise
    finally:
        if db_connected:
            try:
                await asyncio.wait_for(db.disconnect(), timeout=5)
            except Exception:
                pass
