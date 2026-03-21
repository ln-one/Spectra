"""
RQ Worker 启动脚本

启动 RQ Worker 进程，监听任务队列并执行任务。
"""

import asyncio
import logging
import os
import signal
import sys
from pathlib import Path

from redis import Redis
from rq import SimpleWorker, Worker

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger(__name__)

# 全局变量用于优雅关闭
worker_instance = None


async def _run_recovery_scan():
    """
    Run one recovery pass on worker startup to mark stale processing tasks.
    """
    from services.database import DatabaseService
    from services.platform.task_recovery import TaskRecoveryService

    db_service = DatabaseService()
    await db_service.connect()
    try:
        summary = await TaskRecoveryService(db_service.db).recover_stale_tasks()
        logger.info(
            "Task recovery scan completed: scanned=%s recovered=%s session_updated=%s",
            summary.get("scanned"),
            summary.get("recovered"),
            summary.get("session_updated"),
        )
    finally:
        await db_service.disconnect()


def signal_handler(signum, frame):
    """处理终止信号，优雅关闭 Worker"""
    signal_name = "SIGTERM" if signum == signal.SIGTERM else "SIGINT"
    logger.info(f"Received {signal_name}, shutting down gracefully...")

    if worker_instance:
        logger.info("Requesting worker to stop after current job...")
        worker_instance.request_stop()
    else:
        logger.warning("No worker instance found, exiting immediately")
        sys.exit(0)


def main():
    """启动 RQ Worker"""
    global worker_instance

    # Load environment variables
    try:
        from dotenv import load_dotenv
    except ModuleNotFoundError:  # pragma: no cover - runtime fallback

        def load_dotenv(*args, **kwargs):
            return False

    base_dir = Path(__file__).resolve().parent
    load_dotenv(dotenv_path=base_dir / ".env", override=False)

    from services.runtime_env import normalize_database_url_for_host_runtime

    normalize_database_url_for_host_runtime()

    # 注册信号处理器
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    # 从环境变量读取 Redis 配置
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", "6379"))
    redis_password = os.getenv("REDIS_PASSWORD")
    redis_db = int(os.getenv("REDIS_DB", "0"))

    logger.info(f"Connecting to Redis at {redis_host}:{redis_port} (db={redis_db})")

    # 创建 Redis 连接
    redis_conn = Redis(
        host=redis_host,
        port=redis_port,
        password=redis_password,
        db=redis_db,
        decode_responses=False,
    )

    # 测试连接
    try:
        redis_conn.ping()
        logger.info("Redis connection successful")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        sys.exit(1)

    # 创建队列列表（按优先级顺序）
    queues = ["high", "default", "low"]
    logger.info(f"Worker listen to queues: {queues}")

    # Startup recovery scan for stale tasks
    if os.getenv("WORKER_RECOVERY_SCAN", "true").lower() in {"1", "true", "yes", "on"}:
        try:
            asyncio.run(_run_recovery_scan())
        except Exception as e:
            logger.error("Task recovery scan failed: %s", e, exc_info=True)

    # 对 async/Prisma 任务，SimpleWorker（不 fork）更稳定
    worker_class_name = os.getenv("RQ_WORKER_CLASS", "simple").lower()
    worker_cls = SimpleWorker if worker_class_name == "simple" else Worker

    # 创建并启动 Worker
    worker_instance = worker_cls(
        queues,
        connection=redis_conn,
        name=os.getenv("WORKER_NAME", None),
    )

    logger.info(
        f"Starting worker: {worker_instance.name} (class={worker_cls.__name__})"
    )

    # IMPORTANT: SimpleWorker runs jobs in the same loop.
    # But many jobs are async. We need to ensure the global db_service is connected.

    async def run_worker_loop():
        from services.database import db_service as global_db

        await global_db.connect()
        try:
            # SimpleWorker.work is synchronous and blocking.
            # We wrap it to allow the async loop to handle Prisma heartbeats if any.
            # However, RQ SimpleWorker just executes the function.
            worker_instance.work(with_scheduler=True)
        finally:
            await global_db.disconnect()

    try:
        asyncio.run(run_worker_loop())
    except Exception as e:
        logger.error(f"Worker error: {e}", exc_info=True)
        sys.exit(1)
    finally:
        logger.info("Worker stopped")
        redis_conn.close()


if __name__ == "__main__":
    main()
