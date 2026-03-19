"""Application lifespan orchestration."""

import logging
from contextlib import asynccontextmanager

from services.database import db_service
from services.platform.redis_manager import RedisConnectionManager

logger = logging.getLogger(__name__)
redis_manager = RedisConnectionManager.from_env()


def create_lifespan():
    """Build the FastAPI lifespan handler."""

    @asynccontextmanager
    async def lifespan(app):
        await db_service.connect()
        try:
            await redis_manager.connect()
            logger.info("Redis connection established")

            from services.task_queue import TaskQueueService

            redis_conn = redis_manager.get_connection()
            app.state.task_queue_service = TaskQueueService(redis_conn)
            logger.info("Task queue service initialized")
        except Exception as exc:
            logger.error("Failed to connect to Redis: %s", exc)
            logger.warning(
                "Application starting without Redis - task queue will not work"
            )
            app.state.task_queue_service = None

        yield

        await redis_manager.disconnect()
        await db_service.disconnect()

    return lifespan
