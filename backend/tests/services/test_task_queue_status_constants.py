from services.task_queue.status_constants import (
    CANCELABLE_QUEUE_JOB_STATUSES,
    QueueJobStatus,
)


def test_cancelable_queue_job_statuses_match_expected_vocabulary():
    assert CANCELABLE_QUEUE_JOB_STATUSES == {
        QueueJobStatus.QUEUED.value,
        QueueJobStatus.SCHEDULED.value,
        QueueJobStatus.DEFERRED.value,
    }
