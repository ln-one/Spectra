from __future__ import annotations

from typing import Any

from .animation_runtime_codegen import (
    RUNTIME_DRAFT_VERSION,
    RUNTIME_GRAPH_VERSION,
    RUNTIME_PLAN_VERSION,
)
from .animation_runtime_contract import GenericExplainerGraphV1

RUNTIME_VERSION = "animation_runtime.v4"
RUNTIME_CONTRACT = "animation_runtime.v4"
RUNTIME_SOURCE = "llm_draft_assembled_graph"


def clean_text(value: Any) -> str:
    return str(value or "").strip()


def report(
    stage: str,
    message: str,
    *,
    rule_id: str | None = None,
    line: int | None = None,
    column: int | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"stage": stage, "message": message}
    if rule_id is not None:
        payload["rule_id"] = rule_id
    if line is not None:
        payload["line"] = line
    if column is not None:
        payload["column"] = column
    return payload


def error(
    message: str,
    *,
    line: int | None = None,
    column: int | None = None,
    source: str | None = None,
    rule_id: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"message": message}
    if line is not None:
        payload["line"] = line
    if column is not None:
        payload["column"] = column
    if source is not None:
        payload["source"] = source
    if rule_id is not None:
        payload["rule_id"] = rule_id
    return payload


def classify_generation_exception(exc: Exception) -> tuple[dict[str, Any], dict[str, Any]]:
    message = str(exc)
    lowered = message.lower()
    if "invalid_api_key" in lowered or "incorrect api key" in lowered:
        err = error(
            "Runtime provider authentication failed.",
            source="provider",
            rule_id="provider_auth_error",
        )
        return err, report("provider_error", err["message"], rule_id="provider_auth_error")
    if isinstance(exc, TimeoutError) or "timeout" in lowered:
        err = error(
            "Runtime provider timed out while generating explainer draft.",
            source="provider",
            rule_id="provider_timeout",
        )
        return err, report("provider_error", err["message"], rule_id="provider_timeout")
    err = error(
        f"Runtime provider failed: {message}",
        source="provider",
        rule_id="provider_failure",
    )
    return err, report("provider_error", err["message"], rule_id="provider_failure")


def compile_error_from_report(report_item: dict[str, Any]) -> dict[str, Any]:
    stage = str(report_item.get("stage") or "")
    source = "schema"
    if stage.startswith("provider"):
        source = "provider"
    elif stage in {"compile", "runtime_compile_error"}:
        source = "runtime_api"
    elif stage in {"sandbox", "sandbox_runtime_error"}:
        source = "sandbox"
    return error(
        report_item.get("message") or "Runtime validation failed.",
        line=report_item.get("line") if isinstance(report_item.get("line"), int) else None,
        column=report_item.get("column") if isinstance(report_item.get("column"), int) else None,
        source=source,
        rule_id=report_item.get("rule_id")
        if isinstance(report_item.get("rule_id"), str)
        else None,
    )


def dedupe_reports(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    for item in items:
        key = (
            item.get("stage"),
            item.get("rule_id"),
            item.get("message"),
            item.get("line"),
            item.get("column"),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def finalize_success_snapshot(
    snapshot: dict[str, Any],
    *,
    family_hint: str,
    prompt_digest: str,
    runtime_draft: dict[str, Any],
    runtime_graph: GenericExplainerGraphV1,
    component_code: str,
    runtime_attempt_count: int,
    runtime_meta: dict[str, Any],
    validation_report: list[dict[str, Any]],
) -> dict[str, Any]:
    validation_report = dedupe_reports(validation_report)
    snapshot["runtime_version"] = RUNTIME_VERSION
    snapshot["runtime_contract"] = RUNTIME_CONTRACT
    snapshot["runtime_source"] = RUNTIME_SOURCE
    snapshot["runtime_graph_version"] = RUNTIME_GRAPH_VERSION
    snapshot["runtime_draft_version"] = RUNTIME_DRAFT_VERSION
    snapshot["runtime_draft"] = runtime_draft
    snapshot["runtime_graph"] = runtime_graph.model_dump(mode="python")
    snapshot.pop("runtime_plan_version", None)
    snapshot.pop("runtime_plan", None)
    snapshot["runtime_attempt_count"] = runtime_attempt_count
    snapshot["runtime_provider"] = runtime_meta.get("runtime_provider")
    snapshot["runtime_model"] = runtime_meta.get("runtime_model")
    snapshot["runtime_diagnostics"] = {
        "finish_reason": runtime_meta.get("finish_reason"),
        "has_reasoning_content": runtime_meta.get("has_reasoning_content"),
        "raw_content_length": runtime_meta.get("raw_content_length"),
        "schema_mode": runtime_meta.get("schema_mode"),
    }
    snapshot["runtime_validation_report"] = validation_report
    snapshot["generation_prompt_digest"] = prompt_digest
    snapshot["family_hint"] = family_hint
    snapshot["scene_outline"] = [
        item.model_dump(mode="python") for item in runtime_graph.scene_outline
    ]
    snapshot["used_primitives"] = runtime_graph.used_primitives
    snapshot["component_code"] = component_code
    snapshot["compile_status"] = "pending"
    snapshot["compile_errors"] = []
    snapshot["title"] = runtime_graph.title
    snapshot["summary"] = runtime_graph.summary
    return snapshot


def finalize_error_snapshot(
    snapshot: dict[str, Any],
    *,
    family_hint: str,
    prompt_digest: str,
    runtime_draft: dict[str, Any] | None,
    runtime_graph: dict[str, Any] | None,
    runtime_attempt_count: int,
    runtime_meta: dict[str, Any],
    validation_report: list[dict[str, Any]],
    scene_outline: list[dict[str, Any]],
) -> dict[str, Any]:
    validation_report = dedupe_reports(validation_report)
    snapshot["runtime_version"] = RUNTIME_VERSION
    snapshot["runtime_contract"] = RUNTIME_CONTRACT
    snapshot["runtime_source"] = RUNTIME_SOURCE
    snapshot["runtime_graph_version"] = RUNTIME_GRAPH_VERSION
    snapshot["runtime_draft_version"] = RUNTIME_DRAFT_VERSION
    snapshot["runtime_draft"] = runtime_draft or {}
    snapshot["runtime_graph"] = runtime_graph or {}
    snapshot.pop("runtime_plan_version", None)
    snapshot.pop("runtime_plan", None)
    snapshot["runtime_attempt_count"] = runtime_attempt_count
    snapshot["runtime_provider"] = runtime_meta.get("runtime_provider")
    snapshot["runtime_model"] = runtime_meta.get("runtime_model")
    snapshot["runtime_diagnostics"] = {
        "finish_reason": runtime_meta.get("finish_reason"),
        "has_reasoning_content": runtime_meta.get("has_reasoning_content"),
        "raw_content_length": runtime_meta.get("raw_content_length"),
        "schema_mode": runtime_meta.get("schema_mode"),
    }
    snapshot["runtime_validation_report"] = validation_report
    snapshot["generation_prompt_digest"] = prompt_digest
    snapshot["family_hint"] = family_hint
    snapshot["scene_outline"] = scene_outline
    snapshot["used_primitives"] = []
    snapshot["component_code"] = ""
    snapshot["compile_status"] = "error"
    snapshot["compile_errors"] = [
        compile_error_from_report(item) for item in validation_report
    ]
    snapshot["title"] = clean_text(snapshot.get("title"))
    snapshot["summary"] = clean_text(snapshot.get("summary"))
    return snapshot
