"""Deferred remote parse reconciliation workflow."""

import asyncio
import logging
from typing import Optional

from .common import run_async_entrypoint

logger = logging.getLogger(__name__)


def run_remote_parse_reconcile_task(
    file_id: str,
    project_id: str,
    session_id: Optional[str] = None,
):
    run_async_entrypoint(
        lambda: execute_remote_parse_reconcile_task(
            file_id=file_id,
            project_id=project_id,
            session_id=session_id,
        )
    )


async def execute_remote_parse_reconcile_task(
    file_id: str,
    project_id: str,
    session_id: Optional[str] = None,
):
    from services.database import DatabaseService
    from services.file_upload_service.remote_parse import (
        enqueue_remote_parse_reconcile_from_env,
        reconcile_remote_parse_once,
    )

    db = DatabaseService()
    db_connected = False
    try:
        await asyncio.wait_for(db.connect(), timeout=10)
        db_connected = True

        outcome = await reconcile_remote_parse_once(
            db=db,
            file_id=file_id,
            session_id=session_id,
        )
        if outcome == "pending":
            await enqueue_remote_parse_reconcile_from_env(
                file_id=file_id,
                project_id=project_id,
                session_id=session_id,
            )
        logger.info(
            "remote_parse_reconcile_task_completed",
            extra={
                "file_id": file_id,
                "project_id": project_id,
                "outcome": outcome,
            },
        )
    finally:
        if db_connected:
            try:
                await asyncio.wait_for(db.disconnect(), timeout=5)
            except Exception as disconnect_exc:
                logger.debug(
                    "remote_parse_reconcile_disconnect_failed: file_id=%s error=%s",
                    file_id,
                    disconnect_exc,
                )
