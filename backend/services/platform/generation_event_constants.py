from __future__ import annotations

from enum import Enum


class GenerationEventType(str, Enum):
    PROGRESS_UPDATED = "progress.updated"
    OUTLINE_UPDATED = "outline.updated"
    SESSION_RECOVERED = "session.recovered"
    SLIDE_UPDATED = "slide.updated"
    STATE_CHANGED = "state.changed"
    TASK_COMPLETED = "task.completed"
    TASK_FAILED = "task.failed"
