"""Model router for task-based model selection."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from enum import Enum
from typing import Iterable


class TaskComplexity(str, Enum):
    """Complexity level used by router strategy."""

    LIGHT = "light"
    HEAVY = "heavy"
    ADAPTIVE = "adaptive"


class ModelRouteReason(str, Enum):
    """Canonical reason vocabulary for model-routing decisions."""

    LIGHTWEIGHT_TASK = "lightweight_task"
    REASONING_OR_RAG_HEAVY_TASK = "reasoning_or_rag_heavy_task"
    CHAT_WITH_RAG_CONTEXT = "chat_with_rag_context"
    CHAT_PROMPT_TOO_LONG = "chat_prompt_too_long"
    CHAT_LIGHTWEIGHT = "chat_lightweight"
    UNKNOWN_TASK_FALLBACK_TO_HEAVY = "unknown_task_fallback_to_heavy"


class ModelRouteFailureReason(str, Enum):
    """Canonical failure vocabulary for AI routing/execution metadata."""

    TIMEOUT = "timeout"
    COMPLETION_ERROR = "completion_error"
    FALLBACK_TIMEOUT = "fallback_timeout"
    FALLBACK_COMPLETION_ERROR = "fallback_completion_error"


class ModelRouteTask(str, Enum):
    """Supported task labels for model routing decisions."""

    INTENT_CLASSIFICATION = "intent_classification"
    TITLE_POLISH = "title_polish"
    OUTLINE_FORMATTING = "outline_formatting"
    SHORT_TEXT_POLISH = "short_text_polish"
    CHAT_RESPONSE = "chat_response"
    RAG_DEEP_SUMMARY = "rag_deep_summary"
    LESSON_PLAN_REASONING = "lesson_plan_reasoning"
    PREVIEW_MODIFICATION = "preview_modification"


@dataclass(frozen=True)
class RouteDecision:
    """Decision payload returned by model router."""

    task: str
    complexity: str
    selected_model: str
    fallback_model: str
    reason: str

    def to_dict(self) -> dict:
        """Return JSON-serializable dict."""
        return asdict(self)


class ModelRouter:
    """Task-aware model router (internal orchestration layer only)."""

    _LIGHT_TASKS = (
        ModelRouteTask.INTENT_CLASSIFICATION.value,
        ModelRouteTask.TITLE_POLISH.value,
        ModelRouteTask.OUTLINE_FORMATTING.value,
        ModelRouteTask.SHORT_TEXT_POLISH.value,
    )
    _ADAPTIVE_TASKS = (ModelRouteTask.CHAT_RESPONSE.value,)
    _HEAVY_TASKS = (
        ModelRouteTask.RAG_DEEP_SUMMARY.value,
        ModelRouteTask.LESSON_PLAN_REASONING.value,
        ModelRouteTask.PREVIEW_MODIFICATION.value,
    )
    _TASK_ORDER = _LIGHT_TASKS + _ADAPTIVE_TASKS + _HEAVY_TASKS
    _LIGHT_TASK_SET = set(_LIGHT_TASKS)
    _ADAPTIVE_TASK_SET = set(_ADAPTIVE_TASKS)
    _HEAVY_TASK_SET = set(_HEAVY_TASKS)

    def __init__(
        self,
        heavy_model: str,
        light_model: str,
        *,
        chat_heavy_prompt_threshold: int = 600,
    ):
        self.heavy_model = heavy_model
        self.light_model = light_model
        self.chat_heavy_prompt_threshold = chat_heavy_prompt_threshold

    @classmethod
    def supported_tasks(cls) -> Iterable[str]:
        """Return all supported route task labels."""
        return cls._TASK_ORDER

    @classmethod
    def policy_table(cls) -> list[dict]:
        """Return routing policy table for docs/audit snapshots."""
        rows: list[dict] = []
        for task in cls._LIGHT_TASKS:
            rows.append(
                {
                    "task": task,
                    "complexity": TaskComplexity.LIGHT.value,
                    "default_model_tier": "light",
                    "fallback_model_tier": "heavy",
                    "rule": ModelRouteReason.LIGHTWEIGHT_TASK.value,
                }
            )
        for task in cls._ADAPTIVE_TASKS:
            rows.append(
                {
                    "task": task,
                    "complexity": TaskComplexity.ADAPTIVE.value,
                    "default_model_tier": "adaptive",
                    "fallback_model_tier": "heavy",
                    "rule": (
                        f"{ModelRouteReason.CHAT_WITH_RAG_CONTEXT.value} | "
                        f"{ModelRouteReason.CHAT_PROMPT_TOO_LONG.value} | "
                        f"{ModelRouteReason.CHAT_LIGHTWEIGHT.value}"
                    ),
                }
            )
        for task in cls._HEAVY_TASKS:
            rows.append(
                {
                    "task": task,
                    "complexity": TaskComplexity.HEAVY.value,
                    "default_model_tier": "heavy",
                    "fallback_model_tier": "heavy",
                    "rule": ModelRouteReason.REASONING_OR_RAG_HEAVY_TASK.value,
                }
            )
        return rows

    def route(
        self,
        task: str,
        *,
        prompt: str = "",
        has_rag_context: bool = False,
    ) -> RouteDecision:
        """Choose model by task type and runtime hints."""
        task_value = (task or "").strip()
        if task_value in self._LIGHT_TASK_SET:
            return RouteDecision(
                task=task_value,
                complexity=TaskComplexity.LIGHT.value,
                selected_model=self.light_model,
                fallback_model=self.heavy_model,
                reason=ModelRouteReason.LIGHTWEIGHT_TASK.value,
            )
        if task_value in self._HEAVY_TASK_SET:
            return RouteDecision(
                task=task_value,
                complexity=TaskComplexity.HEAVY.value,
                selected_model=self.heavy_model,
                fallback_model=self.heavy_model,
                reason=ModelRouteReason.REASONING_OR_RAG_HEAVY_TASK.value,
            )
        if task_value in self._ADAPTIVE_TASK_SET:
            if has_rag_context:
                return RouteDecision(
                    task=task_value,
                    complexity=TaskComplexity.ADAPTIVE.value,
                    selected_model=self.heavy_model,
                    fallback_model=self.heavy_model,
                    reason=ModelRouteReason.CHAT_WITH_RAG_CONTEXT.value,
                )
            prompt_length = len((prompt or "").strip())
            if prompt_length >= self.chat_heavy_prompt_threshold:
                return RouteDecision(
                    task=task_value,
                    complexity=TaskComplexity.ADAPTIVE.value,
                    selected_model=self.heavy_model,
                    fallback_model=self.heavy_model,
                    reason=ModelRouteReason.CHAT_PROMPT_TOO_LONG.value,
                )
            return RouteDecision(
                task=task_value,
                complexity=TaskComplexity.ADAPTIVE.value,
                selected_model=self.light_model,
                fallback_model=self.heavy_model,
                reason=ModelRouteReason.CHAT_LIGHTWEIGHT.value,
            )
        return RouteDecision(
            task=task_value or "unknown",
            complexity=TaskComplexity.HEAVY.value,
            selected_model=self.heavy_model,
            fallback_model=self.heavy_model,
            reason=ModelRouteReason.UNKNOWN_TASK_FALLBACK_TO_HEAVY.value,
        )
