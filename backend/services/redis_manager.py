"""
Redis 连接管理器

管理 Redis 连接的生命周期，提供连接池和健康检查功能。
"""

import logging
import os
from typing import Optional

from redis import Redis
from redis.exceptions import ConnectionError, RedisError

logger = logging.getLogger(__name__)


class RedisConnectionManager:
    """Redis 连接管理器"""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 6379,
        db: int = 0,
        password: Optional[str] = None,
        decode_responses: bool = True,
    ):
        """
        初始化 Redis 连接配置

        Args:
            host: Redis 服务器地址
            port: Redis 服务器端口
            db: Redis 数据库编号
            password: Redis 密码（可选）
            decode_responses: 是否自动解码响应为字符串
        """
        self.host = host
        self.port = port
        self.db = db
        self.password = password
        self.decode_responses = decode_responses
        self._connection: Optional[Redis] = None

        logger.info(f"Redis connection manager initialized: {host}:{port}, db={db}")

    async def connect(self) -> Redis:
        """
        建立 Redis 连接

        Returns:
            Redis: Redis 连接实例

        Raises:
            ConnectionError: 连接失败时抛出
        """
        try:
            self._connection = Redis(
                host=self.host,
                port=self.port,
                db=self.db,
                password=self.password if self.password else None,
                decode_responses=self.decode_responses,
                socket_connect_timeout=5,
                socket_timeout=5,
            )

            # 测试连接
            self._connection.ping()
            logger.info(f"Successfully connected to Redis at {self.host}:{self.port}")
            return self._connection

        except ConnectionError as e:
            error_msg = f"Failed to connect to Redis at {self.host}:{self.port}: {e}"
            logger.error(error_msg)
            raise ConnectionError(error_msg) from e
        except Exception as e:
            error_msg = f"Unexpected error connecting to Redis: {e}"
            logger.error(error_msg)
            raise ConnectionError(error_msg) from e

    async def disconnect(self):
        """关闭 Redis 连接"""
        if self._connection:
            try:
                self._connection.close()
                logger.info("Redis connection closed")
            except Exception as e:
                logger.warning(f"Error closing Redis connection: {e}")
            finally:
                self._connection = None

    def get_connection(self) -> Redis:
        """
        获取当前 Redis 连接

        Returns:
            Redis: Redis 连接实例

        Raises:
            RuntimeError: 连接未建立时抛出
        """
        if not self._connection:
            raise RuntimeError(
                "Redis connection not established. Call connect() first."
            )
        return self._connection

    async def health_check(self) -> bool:
        """
        检查 Redis 连接健康状态

        Returns:
            bool: 连接正常返回 True，否则返回 False
        """
        try:
            if not self._connection:
                logger.warning("Redis connection not established")
                return False

            self._connection.ping()
            return True
        except RedisError as e:
            logger.error(f"Redis health check failed: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error during Redis health check: {e}")
            return False

    @classmethod
    def from_env(cls) -> "RedisConnectionManager":
        """
        从环境变量创建 Redis 连接管理器

        环境变量:
            REDIS_HOST: Redis 服务器地址（默认: localhost）
            REDIS_PORT: Redis 服务器端口（默认: 6379）
            REDIS_DB: Redis 数据库编号（默认: 0）
            REDIS_PASSWORD: Redis 密码（可选）

        Returns:
            RedisConnectionManager: Redis 连接管理器实例
        """
        host = os.getenv("REDIS_HOST", "localhost")
        port = int(os.getenv("REDIS_PORT", "6379"))
        db = int(os.getenv("REDIS_DB", "0"))
        password = os.getenv("REDIS_PASSWORD")

        return cls(
            host=host,
            port=port,
            db=db,
            password=password if password else None,
        )
