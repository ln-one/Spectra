from scripts.worker_queue_diagnose import RegistrySummary, evaluate_health
from services.task_queue.status_constants import QueueJobStatus


def test_evaluate_health_flags_missing_workers_and_stuck_started_jobs():
    messages, failures = evaluate_health(
        {
            "workers": {"count": 0},
            "queues": {"default": {"count": 2}},
        },
        [
            RegistrySummary(
                queue="default",
                status=QueueJobStatus.STARTED,
                count=1,
                oldest_age_seconds=900.0,
                sample_job_ids=("job-1",),
            ),
            RegistrySummary(
                queue="default",
                status=QueueJobStatus.FAILED,
                count=2,
                oldest_age_seconds=120.0,
                sample_job_ids=("job-2", "job-3"),
            ),
        ],
        stuck_started_threshold_seconds=600.0,
    )

    assert failures == 2
    assert any("FAIL workers" in message for message in messages)
    assert any("FAIL started-registry" in message for message in messages)
    assert any("WARN failed-registry" in message for message in messages)
    assert any("INFO queue-depth" in message for message in messages)


def test_evaluate_health_accepts_healthy_queue_state():
    messages, failures = evaluate_health(
        {
            "workers": {"count": 2},
            "queues": {"high": {"count": 0}},
        },
        [
            RegistrySummary(
                queue="high",
                status=QueueJobStatus.STARTED,
                count=0,
                oldest_age_seconds=None,
                sample_job_ids=(),
            ),
            RegistrySummary(
                queue="high",
                status=QueueJobStatus.FAILED,
                count=0,
                oldest_age_seconds=None,
                sample_job_ids=(),
            ),
        ],
        stuck_started_threshold_seconds=600.0,
    )

    assert failures == 0
    assert any("PASS workers" in message for message in messages)
    assert any("PASS started-registry" in message for message in messages)
    assert any("PASS failed-registry" in message for message in messages)
