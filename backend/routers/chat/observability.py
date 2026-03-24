import hashlib
from typing import Optional

from schemas.chat import ChatObservability, ChatRouteTask
from services.ai.model_router import ModelRouteTask

PROMPT_TEMPLATE_VERSION = "v1.0"
FEW_SHOT_VERSION = "v1.0"


def build_observability_metadata(
    *,
    request_id: str,
    route_task: ChatRouteTask | ModelRouteTask | str,
    selected_model: str,
    has_rag_context: bool,
    rag_failure_reason: Optional[str] = None,
    rag_query_length: Optional[int] = None,
    fallback_triggered: bool,
    provider_model: Optional[str] = None,
    prompt_digest: Optional[str] = None,
    response_digest: Optional[str] = None,
    mechanical_pattern_hit: Optional[bool] = None,
    latency_ms: Optional[float] = None,
    route_decision: Optional[dict] = None,
) -> dict:
    metadata = ChatObservability(
        request_id=request_id,
        route_task=route_task,
        selected_model=selected_model,
        has_rag_context=has_rag_context,
        rag_failure_reason=rag_failure_reason,
        rag_query_length=rag_query_length,
        fallback_triggered=fallback_triggered,
        latency_ms=latency_ms,
        provider_model=provider_model,
        prompt_hash=prompt_digest,
        response_hash=response_digest,
        mechanical_pattern_hit=mechanical_pattern_hit,
        route_decision=route_decision,
    ).model_dump(exclude_none=True)
    return metadata


def prompt_hash(prompt: str) -> str:
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:16]


def response_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]
