from __future__ import annotations

from enum import Enum


class GenerationEventType(str, Enum):
    PROGRESS_UPDATED = "progress.updated"
    OUTLINE_UPDATED = "outline.updated"
    OUTLINE_STARTED = "outline.started"
    OUTLINE_SECTION_GENERATED = "outline.section.generated"
    OUTLINE_COMPLETED = "outline.completed"
    PPT_STARTED = "ppt.started"
    PPT_SLIDE_GENERATED = "ppt.slide.generated"
    PPT_COMPLETED = "ppt.completed"
    WORD_STARTED = "word.started"
    WORD_SECTION_GENERATED = "word.section.generated"
    WORD_COMPLETED = "word.completed"
    SESSION_RECOVERED = "session.recovered"
    SLIDE_UPDATED = "slide.updated"
    SLIDE_MODIFY_PROCESSING = "slide.modify.processing"
    SLIDE_MODIFY_FAILED = "slide.modify.failed"
    SLIDES_STARTED = "slides.started"
    SLIDE_GENERATING = "slide.generating"
    SLIDE_GENERATED = "slide.generated"
    SLIDES_COMPLETED = "slides.completed"
    GENERATION_COMPLETED = "generation.completed"
    GENERATION_FAILED = "generation.failed"
    STATE_CHANGED = "state.changed"
    TASK_COMPLETED = "task.completed"
    TASK_FAILED = "task.failed"
