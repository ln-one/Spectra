import os
from typing import Optional

from services.ai.model_router import ModelRouteTask


def resolve_timeout_seconds(
    route_task: Optional[ModelRouteTask | str],
    *,
    request_timeout_seconds: float,
    chat_request_timeout_seconds: float,
) -> float:
    normalized_route_task = (
        route_task.value if isinstance(route_task, ModelRouteTask) else route_task
    )
    if normalized_route_task == ModelRouteTask.CHAT_RESPONSE.value:
        return chat_request_timeout_seconds
    return request_timeout_seconds


def resolve_requested_model(
    *,
    model_router,
    default_model: str,
    model: Optional[str],
    route_task: Optional[ModelRouteTask | str],
    prompt: str,
    has_rag_context: bool,
):
    route_decision = None
    requested_model = model
    normalized_route_task = (
        route_task.value if isinstance(route_task, ModelRouteTask) else route_task
    )
    if not requested_model:
        if normalized_route_task:
            route_decision = model_router.route(
                normalized_route_task,
                prompt=prompt,
                has_rag_context=has_rag_context,
            )
            requested_model = route_decision.selected_model
        else:
            requested_model = default_model
    return route_decision, requested_model, normalized_route_task


def resolve_upstream_retry_attempts() -> int:
    raw_value = os.getenv("AI_UPSTREAM_RETRY_ATTEMPTS", "1").strip()
    try:
        return max(0, int(raw_value))
    except ValueError:
        return 1


def resolve_upstream_retry_delay_seconds() -> float:
    raw_value = os.getenv("AI_UPSTREAM_RETRY_DELAY_SECONDS", "0.35").strip()
    try:
        return max(0.0, float(raw_value))
    except ValueError:
        return 0.35
