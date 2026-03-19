"""
Redis 连接管理器单元测试
"""

import pytest
from fakeredis import FakeRedis
from redis.exceptions import ConnectionError

from services.platform.redis_manager import RedisConnectionManager


@pytest.fixture
def redis_manager():
    """创建测试用的 Redis 连接管理器"""
    return RedisConnectionManager(host="localhost", port=6379, db=0)


@pytest.fixture
def fake_redis(monkeypatch):
    """使用 FakeRedis 模拟 Redis 连接"""

    def mock_redis(*args, **kwargs):
        return FakeRedis(decode_responses=kwargs.get("decode_responses", True))

    monkeypatch.setattr("services.platform.redis_manager.Redis", mock_redis)


@pytest.mark.asyncio
async def test_connect_success(redis_manager, fake_redis):
    """测试成功建立连接"""
    conn = await redis_manager.connect()
    assert conn is not None
    assert redis_manager._connection is not None


@pytest.mark.asyncio
async def test_connect_failure(redis_manager, monkeypatch):
    """测试连接失败处理"""

    def mock_redis_fail(*args, **kwargs):
        raise ConnectionError("Connection refused")

    monkeypatch.setattr("services.platform.redis_manager.Redis", mock_redis_fail)

    with pytest.raises(ConnectionError) as exc_info:
        await redis_manager.connect()

    assert "Failed to connect to Redis" in str(exc_info.value)


@pytest.mark.asyncio
async def test_disconnect(redis_manager, fake_redis):
    """测试断开连接"""
    await redis_manager.connect()
    await redis_manager.disconnect()
    assert redis_manager._connection is None


@pytest.mark.asyncio
async def test_get_connection_success(redis_manager, fake_redis):
    """测试获取连接成功"""
    await redis_manager.connect()
    conn = redis_manager.get_connection()
    assert conn is not None


def test_get_connection_not_established(redis_manager):
    """测试连接未建立时获取连接"""
    with pytest.raises(RuntimeError) as exc_info:
        redis_manager.get_connection()

    assert "Redis connection not established" in str(exc_info.value)


@pytest.mark.asyncio
async def test_health_check_success(redis_manager, fake_redis):
    """测试健康检查成功"""
    await redis_manager.connect()
    is_healthy = await redis_manager.health_check()
    assert is_healthy is True


@pytest.mark.asyncio
async def test_health_check_not_connected(redis_manager):
    """测试连接未建立时的健康检查"""
    is_healthy = await redis_manager.health_check()
    assert is_healthy is False


@pytest.mark.asyncio
async def test_health_check_connection_error(redis_manager, fake_redis, monkeypatch):
    """测试健康检查时连接错误"""
    await redis_manager.connect()

    # Mock ping to raise error
    def mock_ping():
        raise ConnectionError("Connection lost")

    monkeypatch.setattr(redis_manager._connection, "ping", mock_ping)

    is_healthy = await redis_manager.health_check()
    assert is_healthy is False


def test_from_env(monkeypatch):
    """测试从环境变量创建管理器"""
    monkeypatch.setenv("REDIS_HOST", "test-host")
    monkeypatch.setenv("REDIS_PORT", "6380")
    monkeypatch.setenv("REDIS_DB", "1")
    monkeypatch.setenv("REDIS_PASSWORD", "test-password")

    manager = RedisConnectionManager.from_env()

    assert manager.host == "test-host"
    assert manager.port == 6380
    assert manager.db == 1
    assert manager.password == "test-password"


def test_from_env_defaults(monkeypatch):
    """测试从环境变量创建管理器（使用默认值）"""
    # Clear environment variables
    monkeypatch.delenv("REDIS_HOST", raising=False)
    monkeypatch.delenv("REDIS_PORT", raising=False)
    monkeypatch.delenv("REDIS_DB", raising=False)
    monkeypatch.delenv("REDIS_PASSWORD", raising=False)

    manager = RedisConnectionManager.from_env()

    assert manager.host == "localhost"
    assert manager.port == 6379
    assert manager.db == 0
    assert manager.password is None
