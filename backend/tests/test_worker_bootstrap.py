from datetime import datetime, timedelta, timezone

from rq.job import JobStatus

from worker import _recover_stale_started_jobs, _resolve_worker_name


def test_resolve_worker_name_appends_host_and_pid(monkeypatch):
    monkeypatch.setenv("WORKER_NAME", "worker-a")
    monkeypatch.setattr("worker.socket.gethostname", lambda: "demo-host.local")
    monkeypatch.setattr("worker.os.getpid", lambda: 4321)
    monkeypatch.setattr("worker.uuid.uuid4", lambda: MockUUID("abc123ef"))

    assert _resolve_worker_name() == "worker-a@demo-host:4321:abc123ef"


def test_resolve_worker_name_defaults_when_env_empty(monkeypatch):
    monkeypatch.delenv("WORKER_NAME", raising=False)
    monkeypatch.setattr("worker.socket.gethostname", lambda: "demo-host")
    monkeypatch.setattr("worker.os.getpid", lambda: 99)
    monkeypatch.setattr("worker.uuid.uuid4", lambda: MockUUID("0123abcd"))

    assert _resolve_worker_name() == "worker@demo-host:99:0123abcd"


class MockUUID:
    def __init__(self, value: str):
        self.hex = value


def test_recover_stale_started_jobs_requeues_abandoned_job(monkeypatch):
    now = datetime(2026, 3, 21, 9, 0, 0, tzinfo=timezone.utc)
    redis_conn = MockRedis()
    registry = MockStartedRegistry(["job-1"])
    queue = MockQueue()
    job = MockJob(
        job_id="job-1",
        worker_name="dead-worker",
        started_at=now - timedelta(minutes=5),
        status=JobStatus.STARTED,
    )

    monkeypatch.setattr("worker.datetime", MockDateTime(now))
    monkeypatch.setattr("worker.Worker.all", lambda connection: [])
    monkeypatch.setattr("worker.StartedJobRegistry", lambda *args, **kwargs: registry)
    monkeypatch.setattr("worker.Queue", lambda *args, **kwargs: queue)
    monkeypatch.setattr("worker.Job.fetch", lambda *args, **kwargs: job)

    recovered = _recover_stale_started_jobs(
        redis_conn=redis_conn,
        queue_names=["default"],
        stale_seconds=90,
        worker_freshness_seconds=45,
    )

    assert recovered == [
        {
            "job_id": "job-1",
            "queue": "default",
            "worker_name": "dead-worker",
            "age_seconds": 300.0,
        }
    ]
    assert registry.removed == ["job-1"]
    assert registry.removed_executions == ["job-1"]
    assert queue.enqueued == ["job-1"]
    assert redis_conn.pipeline_obj.executed is True


def test_recover_stale_started_jobs_skips_live_worker_job(monkeypatch):
    now = datetime(2026, 3, 21, 9, 0, 0, tzinfo=timezone.utc)
    redis_conn = MockRedis()
    registry = MockStartedRegistry(["job-1"])
    queue = MockQueue()
    job = MockJob(
        job_id="job-1",
        worker_name="live-worker",
        started_at=now - timedelta(minutes=5),
        status=JobStatus.STARTED,
    )
    live_worker = MockWorker(
        name="live-worker",
        last_heartbeat=now - timedelta(seconds=5),
    )

    monkeypatch.setattr("worker.datetime", MockDateTime(now))
    monkeypatch.setattr("worker.Worker.all", lambda connection: [live_worker])
    monkeypatch.setattr("worker.StartedJobRegistry", lambda *args, **kwargs: registry)
    monkeypatch.setattr("worker.Queue", lambda *args, **kwargs: queue)
    monkeypatch.setattr("worker.Job.fetch", lambda *args, **kwargs: job)

    recovered = _recover_stale_started_jobs(
        redis_conn=redis_conn,
        queue_names=["default"],
        stale_seconds=90,
        worker_freshness_seconds=45,
    )

    assert recovered == []
    assert registry.removed == []
    assert queue.enqueued == []


class MockDateTime:
    def __init__(self, now):
        self._now = now

    def now(self, tz=None):
        return self._now


class MockRedis:
    def __init__(self):
        self.pipeline_obj = MockPipeline()

    def pipeline(self):
        return self.pipeline_obj


class MockPipeline:
    def __init__(self):
        self.executed = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self):
        self.executed = True


class MockStartedRegistry:
    def __init__(self, job_ids):
        self._job_ids = job_ids
        self.removed = []
        self.removed_executions = []

    def get_job_ids(self):
        return self._job_ids

    def remove(self, job, pipeline=None):
        self.removed.append(job.id)

    def remove_executions(self, job, pipeline=None):
        self.removed_executions.append(job.id)


class MockQueue:
    def __init__(self):
        self.enqueued = []

    def _enqueue_job(self, job, pipeline=None):
        self.enqueued.append(job.id)


class MockJob:
    def __init__(self, job_id: str, worker_name: str, started_at, status):
        self.id = job_id
        self.worker_name = worker_name
        self.started_at = started_at
        self._status = status

    def get_status(self):
        return self._status


class MockWorker:
    def __init__(self, name: str, last_heartbeat):
        self.name = name
        self.last_heartbeat = last_heartbeat
