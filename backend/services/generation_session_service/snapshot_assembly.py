from __future__ import annotations

from services.generation_session_service.capability_helpers import _default_capabilities
from services.generation_session_service.serialization_helpers import _to_session_ref
from services.platform.state_transition_guard import GenerationState


def build_session_snapshot_payload(
    *,
    session,
    contract_version: str,
    schema_version: int,
    guard,
    outline,
    fallbacks,
    artifact_history: dict,
    latest_candidate_change,
    current_run,
    result,
) -> dict:
    return {
        "session": _to_session_ref(
            session,
            contract_version,
            schema_version,
        ),
        "options": None,
        "outline": outline,
        "context_snapshot": None,
        "capabilities": _default_capabilities(),
        "fallbacks": fallbacks,
        "artifact_id": artifact_history["artifact_id"],
        "based_on_version_id": artifact_history["based_on_version_id"],
        "artifact_anchor": artifact_history["artifact_anchor"],
        "latest_candidate_change": latest_candidate_change,
        "session_artifacts": artifact_history["session_artifacts"],
        "session_artifact_groups": artifact_history["session_artifact_groups"],
        "allowed_actions": guard.get_allowed_actions(session.state),
        "current_run": current_run,
        "result": result,
        "error": (
            {
                "code": session.errorCode,
                "message": session.errorMessage,
                "retryable": session.errorRetryable,
                "fallback": None,
                "transition_guard": "StateTransitionGuard",
            }
            if session.state == GenerationState.FAILED.value and session.errorCode
            else None
        ),
    }
