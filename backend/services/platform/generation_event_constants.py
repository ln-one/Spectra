from __future__ import annotations

from enum import Enum


class GenerationEventType(str, Enum):
    STATE_CHANGED = "state.changed"
    TASK_COMPLETED = "task.completed"
    TASK_FAILED = "task.failed"
