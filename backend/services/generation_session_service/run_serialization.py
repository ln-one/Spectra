from __future__ import annotations

from typing import Any, Optional

from services.prompt_service import build_prompt_traceability


def serialize_session_run(run: Any | None) -> Optional[dict]:
    if not run:
        return None
    return {
        "run_id": getattr(run, "id", None),
        "session_id": getattr(run, "sessionId", None),
        "project_id": getattr(run, "projectId", None),
        "tool_type": getattr(run, "toolType", None),
        "run_no": getattr(run, "runNo", None),
        "run_title": getattr(run, "title", None),
        "run_title_source": getattr(run, "titleSource", None),
        "run_title_updated_at": (
            getattr(run, "titleUpdatedAt").isoformat()
            if getattr(run, "titleUpdatedAt", None)
            else None
        ),
        "run_status": getattr(run, "status", None),
        "run_step": getattr(run, "step", None),
        "artifact_id": getattr(run, "artifactId", None),
        "created_at": (
            run.createdAt.isoformat() if getattr(run, "createdAt", None) else None
        ),
        "updated_at": (
            run.updatedAt.isoformat() if getattr(run, "updatedAt", None) else None
        ),
    }


def build_run_trace_payload(run: Any | dict | None, **extra: Any) -> dict:
    payload: dict[str, Any] = {}
    if run:
        run_payload = run if isinstance(run, dict) else serialize_session_run(run)
        if run_payload:
            payload.update(run_payload)
    payload.update({key: value for key, value in extra.items() if value is not None})
    return payload


def build_run_prompt_trace_payload(*, rag_source_ids: list[str] | None = None) -> dict:
    return build_prompt_traceability(rag_source_ids=rag_source_ids)
