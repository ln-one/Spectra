"""Compatibility exports for task executor runtime helpers.

The concrete logic lives in smaller support modules so generation execution can
stay readable without growing another orchestration monolith.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Optional

from schemas.generation import TaskStatus
from services.generation_session_service.session_history import (
    RUN_STATUS_COMPLETED,
    RUN_STEP_COMPLETED,
    update_session_run,
)
from services.platform.state_transition_guard import GenerationState
from services.task_executor.runtime_artifact_persistence import (
    build_project_space_download_url,
    persist_generation_artifacts,
)
from services.task_executor.runtime_context import build_run_context_payload
from services.task_executor.runtime_render_outputs import render_generation_outputs

from .constants import TaskFailureStateReason

logger = logging.getLogger(__name__)


async def finalize_generation_success(
    db_service,
    context,
    output_urls: dict,
    payload_extra: Optional[dict] = None,
) -> None:
    from .common import sync_session_terminal_state

    await db_service.update_generation_task_status(
        task_id=context.task_id,
        status=TaskStatus.COMPLETED,
        progress=100,
        output_urls=json.dumps(output_urls),
    )

    try:
        run_payload = build_run_context_payload(context)
        if run_payload.get("run_id"):
            await update_session_run(
                db=db_service.db,
                run_id=run_payload["run_id"],
                status=RUN_STATUS_COMPLETED,
                step=RUN_STEP_COMPLETED,
            )
        await sync_session_terminal_state(
            db_service=db_service,
            task_id=context.task_id,
            session_id=context.session_id,
            state=GenerationState.SUCCESS.value,
            state_reason=TaskFailureStateReason.COMPLETED.value,
            output_urls=output_urls,
            payload_extra={
                **(payload_extra or {}),
                **(
                    {
                        **run_payload,
                        "run_status": RUN_STATUS_COMPLETED,
                        "run_step": RUN_STEP_COMPLETED,
                    }
                    if run_payload.get("run_id")
                    else {}
                ),
            },
        )
        if context.session_id:
            logger.info(
                "session_state_updated_to_success",
                extra={
                    "session_id": context.session_id,
                    "task_id": context.task_id,
                    "timestamp": time.time(),
                },
            )
    except Exception as sync_err:
        logger.error(
            "failed_to_sync_session_success_state " "task_id=%s session_id=%s error=%s",
            context.task_id,
            context.session_id,
            sync_err,
            exc_info=True,
        )

    logger.info(
        "generation_task_completed",
        extra={
            "task_id": context.task_id,
            "project_id": context.project_id,
            "output_urls": output_urls,
            **(payload_extra or {}),
            "execution_time": time.time() - context.start_time,
            "timestamp": time.time(),
        },
    )
