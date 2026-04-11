"""
RQ 任务队列服务单元测试
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

import pytest
from fakeredis import FakeStrictRedis
from rq.job import Job

from services.task_queue import TaskQueueService
from services.task_queue.status import (
    _is_worker_fresh,
    inspect_worker_availability,
    resolve_worker_availability,
)
from services.task_queue.status_constants import QueueWorkerAvailability


@pytest.fixture
def fake_redis():
    """创建 FakeRedis 实例"""
    return FakeStrictRedis()


@pytest.fixture
def task_queue_service(fake_redis):
    """创建 TaskQueueService 实例"""
    return TaskQueueService(fake_redis)


class TestTaskQueueService:
    """TaskQueueService 测试类"""

    def test_init(self, task_queue_service):
        """测试服务初始化"""
        assert task_queue_service.high_queue.name == "high"
        assert task_queue_service.default_queue.name == "default"
        assert task_queue_service.low_queue.name == "low"

    def test_enqueue_generation_task_default_priority(self, task_queue_service):
        """测试提交任务到默认优先级队列"""
        with patch("services.task_queue.Queue.enqueue") as mock_enqueue:
            mock_job = Mock(spec=Job)
            mock_job.id = "job-123"
            mock_enqueue.return_value = mock_job

            job = task_queue_service.enqueue_generation_task(
                task_id="test-task-1",
                project_id="test-project-1",
                task_type="pptx",
                priority="default",
                timeout=1800,
            )

            assert job is not None
            assert mock_enqueue.called

    def test_enqueue_generation_task_high_priority(self, task_queue_service):
        """测试提交任务到高优先级队列"""
        with patch("services.task_queue.Queue.enqueue") as mock_enqueue:
            mock_job = Mock(spec=Job)
            mock_job.id = "job-456"
            mock_enqueue.return_value = mock_job

            job = task_queue_service.enqueue_generation_task(
                task_id="test-task-2",
                project_id="test-project-1",
                task_type="docx",
                priority="high",
                timeout=3600,
            )

            assert job is not None
            assert mock_enqueue.called

    def test_enqueue_generation_task_low_priority(self, task_queue_service):
        """测试提交任务到低优先级队列"""
        with patch("services.task_queue.Queue.enqueue") as mock_enqueue:
            mock_job = Mock(spec=Job)
            mock_job.id = "job-789"
            mock_enqueue.return_value = mock_job

            job = task_queue_service.enqueue_generation_task(
                task_id="test-task-3",
                project_id="test-project-1",
                task_type="both",
                priority="low",
                timeout=900,
            )

            assert job is not None
            assert mock_enqueue.called

    def test_enqueue_generation_task_invalid_priority(self, task_queue_service):
        """测试无效优先级参数"""
        with pytest.raises(ValueError, match="Invalid priority"):
            task_queue_service.enqueue_generation_task(
                task_id="test-task-4",
                project_id="test-project-1",
                task_type="pptx",
                priority="invalid",
            )

    def test_enqueue_generation_task_with_template_config(self, task_queue_service):
        """测试提交任务时传递模板配置"""
        with patch("services.task_queue.Queue.enqueue") as mock_enqueue:
            mock_job = Mock(spec=Job)
            mock_job.id = "job-999"
            mock_enqueue.return_value = mock_job

            template_config = {"theme": "default", "layout": "standard"}

            job = task_queue_service.enqueue_generation_task(
                task_id="test-task-5",
                project_id="test-project-1",
                task_type="pptx",
                template_config=template_config,
            )

            assert job is not None
            assert mock_enqueue.called

    def test_enqueue_remote_parse_reconcile_task_uses_direct_enqueue(
        self, task_queue_service
    ):
        with patch("services.task_queue.enqueue._resolve_queue") as mock_resolve_queue:
            mock_job = Mock(spec=Job)
            mock_job.id = "job-remote-1"
            mock_queue = Mock()
            mock_queue.enqueue.return_value = mock_job
            mock_resolve_queue.return_value = mock_queue

            job = task_queue_service.enqueue_remote_parse_reconcile_task(
                file_id="file-123",
                project_id="project-123",
                session_id="session-123",
                delay_seconds=5,
            )

            assert job is not None
            assert mock_queue.enqueue.called
            assert mock_queue.enqueue.call_args.kwargs["initial_delay_seconds"] == 5

    @patch("services.task_queue.Job.fetch")
    def test_get_job_status_queued(self, mock_fetch, task_queue_service):
        """测试获取排队中任务状态"""
        mock_job = Mock(spec=Job)
        mock_job.id = "job-123"
        mock_job.get_status.return_value = "queued"
        mock_job.created_at = None
        mock_job.started_at = None
        mock_job.ended_at = None
        mock_job.is_finished = False
        mock_job.is_failed = False
        mock_fetch.return_value = mock_job

        status = task_queue_service.get_job_status("job-123")

        assert status is not None
        assert status["job_id"] == "job-123"
        assert status["status"] == "queued"

    @patch("services.task_queue.Job.fetch")
    def test_get_job_status_finished(self, mock_fetch, task_queue_service):
        """测试获取已完成任务状态"""
        mock_job = Mock(spec=Job)
        mock_job.id = "job-456"
        mock_job.get_status.return_value = "finished"
        mock_job.created_at = None
        mock_job.started_at = None
        mock_job.ended_at = None
        mock_job.is_finished = True
        mock_job.is_failed = False
        mock_job.result = {"success": True}
        mock_fetch.return_value = mock_job

        status = task_queue_service.get_job_status("job-456")

        assert status is not None
        assert status["status"] == "finished"
        assert status["result"] == {"success": True}

    @patch("services.task_queue.Job.fetch")
    def test_get_job_status_failed(self, mock_fetch, task_queue_service):
        """测试获取失败任务状态"""
        mock_job = Mock(spec=Job)
        mock_job.id = "job-789"
        mock_job.get_status.return_value = "failed"
        mock_job.created_at = None
        mock_job.started_at = None
        mock_job.ended_at = None
        mock_job.is_finished = False
        mock_job.is_failed = True
        mock_job.exc_info = "Error: Task failed"
        mock_fetch.return_value = mock_job

        status = task_queue_service.get_job_status("job-789")

        assert status is not None
        assert status["status"] == "failed"
        assert status["exc_info"] == "Error: Task failed"

    @patch("services.task_queue.Job.fetch")
    def test_get_job_status_not_found(self, mock_fetch, task_queue_service):
        """测试获取不存在的任务状态"""
        mock_fetch.side_effect = Exception("Job not found")

        status = task_queue_service.get_job_status("non-existent")

        assert status is None

    @patch("services.task_queue.Job.fetch")
    def test_cancel_job_success(self, mock_fetch, task_queue_service):
        """测试成功取消任务"""
        mock_job = Mock(spec=Job)
        mock_job.get_status.return_value = "queued"
        mock_fetch.return_value = mock_job

        result = task_queue_service.cancel_job("job-123")

        assert result is True
        mock_job.cancel.assert_called_once()

    @patch("services.task_queue.Job.fetch")
    def test_cancel_job_already_started(self, mock_fetch, task_queue_service):
        """测试取消已开始的任务"""
        mock_job = Mock(spec=Job)
        mock_job.get_status.return_value = "started"
        mock_fetch.return_value = mock_job

        result = task_queue_service.cancel_job("job-456")

        assert result is False
        mock_job.cancel.assert_not_called()

    @patch("services.task_queue.Job.fetch")
    def test_cancel_job_not_found(self, mock_fetch, task_queue_service):
        """测试取消不存在的任务"""
        mock_fetch.side_effect = Exception("Job not found")

        result = task_queue_service.cancel_job("non-existent")

        assert result is False

    @patch("rq.Worker.all")
    def test_get_queue_info(self, mock_worker_all, task_queue_service, fake_redis):
        """测试获取队列统计信息"""
        # Mock workers
        mock_worker1 = Mock()
        mock_worker1.name = "worker-1"
        mock_worker1.get_state.return_value = "busy"
        mock_worker1.last_heartbeat = datetime.now(timezone.utc)

        mock_worker2 = Mock()
        mock_worker2.name = "worker-2"
        mock_worker2.get_state.return_value = "idle"
        mock_worker2.last_heartbeat = datetime.now(timezone.utc)

        mock_worker_all.return_value = [mock_worker1, mock_worker2]

        info = task_queue_service.get_queue_info()

        assert "queues" in info
        assert "workers" in info
        assert "jobs" in info
        assert info["workers"]["count"] == 2
        assert "worker-1" in info["workers"]["active"]
        assert "worker-2" not in info["workers"]["active"]

    @patch("rq.Worker.all")
    def test_get_queue_info_excludes_stale_workers(
        self, mock_worker_all, task_queue_service, fake_redis, monkeypatch
    ):
        monkeypatch.delenv("RQ_WORKER_HEARTBEAT_FRESHNESS_SECONDS", raising=False)

        fresh_worker = Mock()
        fresh_worker.name = "worker-fresh"
        fresh_worker.get_state.return_value = "idle"
        fresh_worker.last_heartbeat = datetime.now(timezone.utc)

        stale_worker = Mock()
        stale_worker.name = "worker-stale"
        stale_worker.get_state.return_value = "busy"
        stale_worker.last_heartbeat = datetime.now(timezone.utc) - timedelta(minutes=5)

        mock_worker_all.return_value = [fresh_worker, stale_worker]

        info = task_queue_service.get_queue_info()

        assert info["workers"]["count"] == 1
        assert info["workers"]["active"] == []
        assert info["workers"]["stale"] == ["worker-stale"]

    @patch("rq.Worker.all")
    def test_get_queue_info_with_error(self, mock_worker_all, task_queue_service):
        """测试获取队列信息时发生错误"""
        mock_worker_all.side_effect = Exception("Redis connection error")

        info = task_queue_service.get_queue_info()

        assert "error" in info
        assert info["workers"]["count"] == 0


def test_inspect_worker_availability_marks_queue_error_as_unknown(task_queue_service):
    task_queue_service.get_queue_info = Mock(
        return_value={"workers": {"count": 0, "stale": ["worker-old"]}, "error": "boom"}
    )

    availability = inspect_worker_availability(task_queue_service)

    assert availability["status"] == QueueWorkerAvailability.UNKNOWN.value
    assert availability["worker_count"] == 0
    assert availability["stale_worker_count"] == 1


def test_is_worker_fresh_uses_worker_ttl_when_env_missing(monkeypatch):
    monkeypatch.delenv("RQ_WORKER_HEARTBEAT_FRESHNESS_SECONDS", raising=False)
    worker = Mock()
    worker.last_heartbeat = datetime.now(timezone.utc) - timedelta(seconds=100)
    worker.worker_ttl = 420

    assert _is_worker_fresh(worker) is True


def test_is_worker_fresh_respects_env_override(monkeypatch):
    monkeypatch.setenv("RQ_WORKER_HEARTBEAT_FRESHNESS_SECONDS", "60")
    worker = Mock()
    worker.last_heartbeat = datetime.now(timezone.utc) - timedelta(seconds=100)
    worker.worker_ttl = 420

    assert _is_worker_fresh(worker) is False


@pytest.mark.asyncio
async def test_resolve_worker_availability_retries_unknown(task_queue_service):
    task_queue_service.get_queue_info = Mock(
        side_effect=[
            {"workers": {"count": 0, "stale": []}, "error": "redis"},
            {"workers": {"count": 1, "stale": ["worker-stale"]}},
        ]
    )

    availability = await resolve_worker_availability(
        task_queue_service,
        retries=1,
        retry_delay_seconds=0,
    )

    assert availability["status"] == QueueWorkerAvailability.AVAILABLE.value
    assert availability["worker_count"] == 1
    assert availability["stale_worker_count"] == 1
