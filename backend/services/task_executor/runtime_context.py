"""Small shared helpers for task executor runtime metadata."""

from __future__ import annotations


def read_field(record, field_name: str):
    if isinstance(record, dict):
        return record.get(field_name)
    return getattr(record, field_name, None)


def build_run_context_payload(context) -> dict:
    run_id = getattr(context, "run_id", None)
    retrieval_mode = getattr(context, "retrieval_mode", None)
    policy_version = getattr(context, "policy_version", None)
    baseline_id = getattr(context, "baseline_id", None)
    if not any([run_id, retrieval_mode, policy_version, baseline_id]):
        return {}
    return {
        "run_id": run_id,
        "run_no": getattr(context, "run_no", None),
        "run_title": getattr(context, "run_title", None),
        "tool_type": getattr(context, "tool_type", None),
        "retrieval_mode": retrieval_mode,
        "policy_version": policy_version,
        "baseline_id": baseline_id,
    }
