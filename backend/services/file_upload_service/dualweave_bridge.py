from __future__ import annotations

import hashlib
import json
from typing import Any, Optional


def _resolved_provider(result: dict[str, Any], fallback: str) -> str:
    for artifact_name in ("processing_artifact", "delivery_artifact"):
        artifact = result.get(artifact_name) or {}
        provider = str(artifact.get("provider") or "").strip()
        if provider:
            return provider

    provider_job = result.get("provider_job") or {}
    provider = str(provider_job.get("provider") or "").strip()
    if provider:
        return provider

    return fallback


def build_dualweave_parse_result(
    result: dict[str, Any],
    *,
    provider: str = "dualweave_remote",
) -> dict[str, Any]:
    processing_artifact = result.get("processing_artifact") or {}
    delivery_artifact = result.get("delivery_artifact") or {}
    error = result.get("error") or {}
    provider_name = _resolved_provider(result, provider)

    normalized: dict[str, Any] = {
        "deferred_parse": True,
        "parse_mode": "dualweave_remote",
        "provider_used": provider_name,
        "dualweave": {
            "upload_id": result.get("upload_id"),
            "status": result.get("status"),
            "stage": result.get("stage"),
            "delivery_status": result.get("delivery_status"),
            "processing_status": result.get("processing_status"),
            "result_source": result.get("result_source"),
            "remote_retryable": result.get("remote_retryable"),
            "remote_next_action": result.get("remote_next_action"),
            "remote_pending_reason": result.get("remote_pending_reason"),
            "sender_attempts": result.get("sender_attempts"),
            "sender_attempts_remaining": result.get("sender_attempts_remaining"),
            "replay_status": result.get("replay_status"),
            "replay_eligible": result.get("replay_eligible"),
            "replay_blocked_reason": result.get("replay_blocked_reason"),
        },
    }

    execution_snapshot = _extract_execution_snapshot(result)
    if execution_snapshot:
        normalized["dualweave"]["execution_snapshot"] = execution_snapshot
        normalized["dualweave"]["execution_digest"] = hashlib.sha256(
            json.dumps(execution_snapshot, sort_keys=True, ensure_ascii=False).encode(
                "utf-8"
            )
        ).hexdigest()

    if processing_artifact:
        normalized["result_url"] = processing_artifact.get("result_url")
        normalized["dualweave_result_url"] = processing_artifact.get("result_url")
        normalized["processing_artifact"] = processing_artifact
    if delivery_artifact:
        normalized["delivery_artifact"] = delivery_artifact
    if error:
        normalized["dualweave_error"] = {
            "code": error.get("code"),
            "message": error.get("message"),
            "retryable": error.get("retryable"),
            "stage": error.get("stage"),
        }

    return normalized


def extract_dualweave_result_url(result: dict[str, Any]) -> Optional[str]:
    artifact = result.get("processing_artifact") or {}
    value = artifact.get("result_url")
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _extract_execution_snapshot(result: dict[str, Any]) -> Optional[dict[str, Any]]:
    raw = result.get("execution_snapshot")
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if isinstance(payload, dict):
            return payload
    return None
