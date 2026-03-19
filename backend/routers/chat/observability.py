import hashlib
from typing import Optional

from schemas.chat import ChatRouteTask

PROMPT_TEMPLATE_VERSION = "v1.0"
FEW_SHOT_VERSION = "v1.0"


def build_observability_metadata(
    *,
    request_id: str,
    route_task: ChatRouteTask | str,
    selected_model: str,
    has_rag_context: bool,
    fallback_triggered: bool,
    provider_model: Optional[str] = None,
    prompt_digest: Optional[str] = None,
    response_digest: Optional[str] = None,
    mechanical_pattern_hit: Optional[bool] = None,
    latency_ms: Optional[float] = None,
    route_decision: Optional[dict] = None,
) -> dict:
    metadata = {
        "request_id": request_id,
        "route_task": getattr(route_task, "value", route_task),
        "selected_model": selected_model,
        "has_rag_context": has_rag_context,
        "fallback_triggered": fallback_triggered,
        "latency_ms": latency_ms,
    }
    if provider_model is not None:
        metadata["provider_model"] = provider_model
    if prompt_digest is not None:
        metadata["prompt_hash"] = prompt_digest
    if response_digest is not None:
        metadata["response_hash"] = response_digest
    if mechanical_pattern_hit is not None:
        metadata["mechanical_pattern_hit"] = mechanical_pattern_hit
    if route_decision:
        metadata["route_decision"] = route_decision
    return metadata


def prompt_hash(prompt: str) -> str:
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:16]


def response_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]
