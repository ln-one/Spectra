"""
RQ Worker 启动脚本

启动 RQ Worker 进程，监听任务队列并执行任务。
"""

import logging
import os
import sys

from redis import Redis
from rq import Worker

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger(__name__)


def main():
    """启动 RQ Worker"""
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
    logger.info(f"Worker will listen to queues: {queues}")

    # 创建并启动 Worker
    worker = Worker(
        queues,
        connection=redis_conn,
        name=os.getenv("WORKER_NAME", None),  # 如果未设置，RQ 会自动生成
    )

    logger.info(f"Starting worker: {worker.name}")
    logger.info("Worker is ready to process tasks...")

    # 启动 Worker（阻塞）
    worker.work(with_scheduler=True)


if __name__ == "__main__":
    main()
