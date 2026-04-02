from __future__ import annotations

from typing import Any, Optional


def build_dualweave_parse_result(
    result: dict[str, Any],
    *,
    provider: str = "dualweave_service",
) -> dict[str, Any]:
    processing_artifact = result.get("processing_artifact") or {}
    delivery_artifact = result.get("delivery_artifact") or {}
    error = result.get("error") or {}

    normalized: dict[str, Any] = {
        "deferred_parse": True,
        "parse_mode": "dualweave_service",
        "provider_used": provider,
        "dualweave": {
            "upload_id": result.get("upload_id"),
            "status": result.get("status"),
            "stage": result.get("stage"),
            "delivery_status": result.get("delivery_status"),
            "processing_status": result.get("processing_status"),
        },
    }

    if processing_artifact:
        normalized["result_url"] = processing_artifact.get("result_url")
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
