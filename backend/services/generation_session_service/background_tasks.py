from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)


def spawn_background_task(coro, *, label: str) -> None:
    try:
        task = asyncio.create_task(coro)
    except RuntimeError:
        if asyncio.iscoroutine(coro):
            coro.close()
        logger.warning("Skip background task without running loop: %s", label)
        return

    def _consume_result(completed: asyncio.Task) -> None:
        try:
            completed.result()
        except Exception as exc:  # pragma: no cover
            logger.warning(
                "Background task failed: %s error=%s", label, exc, exc_info=True
            )

    task.add_done_callback(_consume_result)
