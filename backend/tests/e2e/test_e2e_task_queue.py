"""
端到端任务队列集成测试

测试完整的任务提交、执行、状态查询流程。
"""

import pytest
from fakeredis import FakeRedis

from services.task_queue import TaskQueueService


@pytest.fixture
def redis_conn():
    """创建 FakeRedis 连接用于测试"""
    return FakeRedis(decode_responses=False)


@pytest.fixture
def task_queue_service(redis_conn):
    """创建任务队列服务"""
    return TaskQueueService(redis_conn)


class TestE2ETaskQueue:
    """端到端任务队列测试"""

    @pytest.mark.asyncio
    async def test_task_submission_and_status_query(
        self, task_queue_service, redis_conn
    ):
        """测试任务提交和状态查询"""
        # 提交任务
        job = task_queue_service.enqueue_generation_task(
            task_id="test-task-1",
            project_id="test-project-1",
            task_type="pptx",
            priority="default",
            timeout=300,
        )

        assert job is not None
        assert job.id is not None

        # 查询任务状态
        status = task_queue_service.get_job_status(job.id)
        assert status is not None
        assert status["job_id"] == job.id
        assert status["status"] in ["queued", "scheduled"]

    @pytest.mark.asyncio
    async def test_task_execution_success(self, task_queue_service):
        """测试任务成功执行（简化版本 - 仅验证任务提交）"""
        # 注意：由于 RQ Worker 在 pytest 的事件循环中运行会有冲突，
        # 这里只测试任务提交和状态查询，实际执行需要在真实环境中测试

        # 提交任务
        job = task_queue_service.enqueue_generation_task(
            task_id="test-task-2",
            project_id="test-project-2",
            task_type="pptx",
            priority="default",
            timeout=300,
        )

        # 验证任务已提交
        assert job is not None
        assert job.id is not None

        # 验证任务在队列中
        status = task_queue_service.get_job_status(job.id)
        assert status is not None
        assert status["status"] in ["queued", "scheduled"]

    @pytest.mark.asyncio
    async def test_task_cancellation(self, task_queue_service):
        """测试任务取消"""
        # 提交任务
        job = task_queue_service.enqueue_generation_task(
            task_id="test-task-3",
            project_id="test-project-3",
            task_type="pptx",
        )

        # 取消任务
        result = task_queue_service.cancel_job(job.id)
        assert result is True

        # 验证任务状态
        status = task_queue_service.get_job_status(job.id)
        assert status["status"] == "canceled"

    @pytest.mark.asyncio
    async def test_queue_priority(self, task_queue_service, redis_conn):
        """测试队列优先级"""
        # 提交不同优先级的任务
        high_job = task_queue_service.enqueue_generation_task(
            task_id="high-task",
            project_id="test-project",
            task_type="pptx",
            priority="high",
        )

        default_job = task_queue_service.enqueue_generation_task(
            task_id="default-task",
            project_id="test-project",
            task_type="pptx",
            priority="default",
        )

        low_job = task_queue_service.enqueue_generation_task(
            task_id="low-task",
            project_id="test-project",
            task_type="pptx",
            priority="low",
        )

        # 验证任务在不同队列中
        assert high_job.origin == "high"
        assert default_job.origin == "default"
        assert low_job.origin == "low"

        # 验证队列信息
        queue_info = task_queue_service.get_queue_info()
        assert queue_info["queues"]["high"]["count"] >= 1
        assert queue_info["queues"]["default"]["count"] >= 1
        assert queue_info["queues"]["low"]["count"] >= 1

    @pytest.mark.asyncio
    async def test_task_timeout(self, task_queue_service):
        """测试任务超时配置"""
        # 测试默认超时
        job = task_queue_service.enqueue_generation_task(
            task_id="test-task-4",
            project_id="test-project-4",
            task_type="pptx",
        )
        assert job.timeout == 1800  # 30 minutes

        # 测试自定义超时
        job = task_queue_service.enqueue_generation_task(
            task_id="test-task-5",
            project_id="test-project-5",
            task_type="pptx",
            timeout=600,
        )
        assert job.timeout == 600

        # 测试超时限制
        with pytest.raises(ValueError):
            task_queue_service.enqueue_generation_task(
                task_id="test-task-6",
                project_id="test-project-6",
                task_type="pptx",
                timeout=30,  # 小于最小值
            )

        with pytest.raises(ValueError):
            task_queue_service.enqueue_generation_task(
                task_id="test-task-7",
                project_id="test-project-7",
                task_type="pptx",
                timeout=4000,  # 大于最大值
            )
