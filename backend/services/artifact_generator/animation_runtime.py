"""Controlled animation runtime snapshot helpers.

This module owns explainer draft generation, generic graph assembly, validation,
repair, and deterministic code compilation before the snapshot is persisted.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
from typing import Any

from pydantic import ValidationError

from .animation_runtime_codegen import (
    SUPPORTED_EXPLAINER_FAMILIES,
    assemble_generic_explainer_graph,
    build_explainer_draft_seed,
    compile_runtime_graph_to_component_code,
    validate_explainer_draft,
    validate_generic_explainer_graph,
)
from .animation_runtime_contract import (
    ExplainerDraftV1,
    GenericExplainerGraphV1,
    build_runtime_contract_prompt_fragment,
    load_animation_runtime_contract,
)
from .animation_runtime_llm import (
    generate_animation_runtime_plan_with_llm,
    repair_animation_runtime_plan_with_llm,
    resolve_runtime_model_meta,
)
from .animation_runtime_snapshot_support import (
    RUNTIME_CONTRACT,
    RUNTIME_SOURCE,
    RUNTIME_VERSION,
    classify_generation_exception,
    clean_text,
    error,
    finalize_error_snapshot,
    finalize_success_snapshot,
    report,
)

MAX_RUNTIME_REPAIR_ATTEMPTS = 2

_CONTRACT = load_animation_runtime_contract()
ALLOWED_PRIMITIVES: tuple[str, ...] = tuple(
    [*_CONTRACT["allowed_primitives"], *_CONTRACT["allowed_hooks"]]
)

_DISALLOWED_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bimport\b"), "Imports are not allowed in runtime code."),
    (re.compile(r"\brequire\s*\("), "require() is not allowed in runtime code."),
    (re.compile(r"\bfetch\s*\("), "Network access is not allowed in runtime code."),
    (re.compile(r"\bXMLHttpRequest\b"), "XMLHttpRequest is not allowed in runtime code."),
    (re.compile(r"\bWebSocket\b"), "WebSocket is not allowed in runtime code."),
    (re.compile(r"\bdocument\b"), "DOM access is not allowed in runtime code."),
    (re.compile(r"\bwindow\b"), "Window access is not allowed in runtime code."),
    (re.compile(r"\bglobalThis\b"), "globalThis access is not allowed in runtime code."),
    (
        re.compile(r"\blocalStorage\b|\bsessionStorage\b"),
        "Storage access is not allowed in runtime code.",
    ),
    (re.compile(r"\beval\s*\("), "eval() is not allowed in runtime code."),
    (re.compile(r"\bFunction\s*\("), "Function constructor is not allowed in runtime code."),
    (
        re.compile(r"\bsetInterval\b|\bsetTimeout\b|\brequestAnimationFrame\b"),
        "Scheduling APIs are not allowed in runtime code.",
    ),
    (
        re.compile(r"\buseEffect\b|\buseLayoutEffect\b"),
        "Side-effect hooks are not allowed in runtime code.",
    ),
)


def resolve_family_hint(content: dict[str, Any]) -> str:
    explicit = clean_text(content.get("family_hint")).lower()
    if explicit:
        return explicit

    animation_family = clean_text(content.get("animation_family")).lower()
    if animation_family:
        return animation_family

    subject_family = clean_text(content.get("subject_family")).lower()
    if subject_family in {"energy_transfer", "lifecycle_cycle"}:
        return "physics_mechanics"
    if subject_family in {"trend_change"}:
        return "math_transform"
    if subject_family in {
        "protocol_exchange",
        "pipeline_sequence",
        "generic_process",
        "traversal_path",
    }:
        return "system_flow"
    if subject_family == "structure_layers":
        return "system_flow"
    return "algorithm_demo"


def build_scene_outline(content: dict[str, Any]) -> list[dict[str, str]]:
    outline: list[dict[str, str]] = []
    for scene in content.get("scenes") or []:
        if not isinstance(scene, dict):
            continue
        title = clean_text(scene.get("title")) or f"Scene {len(outline) + 1}"
        summary = clean_text(scene.get("description") or scene.get("emphasis"))
        outline.append({"title": title, "summary": summary})
    if outline:
        return outline
    title = clean_text(content.get("title")) or "Animation"
    summary = clean_text(content.get("summary"))
    return [{"title": title, "summary": summary}]


def _build_prompt_digest(content: dict[str, Any], family_hint: str) -> str:
    digest_source = json.dumps(
        {
            "title": clean_text(content.get("title")),
            "topic": clean_text(content.get("topic")),
            "summary": clean_text(content.get("summary")),
            "focus": clean_text(content.get("focus")),
            "duration_seconds": int(content.get("duration_seconds") or 6),
            "rhythm": clean_text(content.get("rhythm") or "balanced"),
            "style_pack": clean_text(content.get("style_pack")),
            "family_hint": family_hint,
            "scene_outline": build_scene_outline(content),
            "runtime_contract": build_runtime_contract_prompt_fragment(),
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(digest_source.encode("utf-8")).hexdigest()[:24]


def validate_runtime_component_code(source: Any) -> list[dict[str, Any]]:
    code = str(source or "").strip()
    if not code:
        return [error("component_code is empty.")]
    if not re.search(r"export\s+default\s+function\s+\w+\s*\(", code):
        return [
            error(
                "component_code must declare `export default function Animation(...)`.",
                source="schema",
                rule_id="missing-default-export",
            )
        ]

    errors: list[dict[str, Any]] = []
    for pattern, message in _DISALLOWED_PATTERNS:
        if pattern.search(code):
            errors.append(error(message, source="runtime_api", rule_id="text-safety-rule"))
    return errors


async def enrich_animation_runtime_snapshot_async(content: dict[str, Any]) -> dict[str, Any]:
    snapshot = dict(content)
    family_hint = resolve_family_hint(snapshot)
    if family_hint not in SUPPORTED_EXPLAINER_FAMILIES:
        return finalize_error_snapshot(
            snapshot,
            family_hint=family_hint,
            prompt_digest="",
            runtime_draft=None,
            runtime_graph=None,
            runtime_attempt_count=0,
            runtime_meta=resolve_runtime_model_meta(),
            validation_report=[
                report(
                    "graph_assembly_error",
                    f"Unsupported explainer family `{family_hint}` in v4 preview runtime.",
                    rule_id="unsupported-family",
                )
            ],
            scene_outline=build_scene_outline(snapshot),
        )

    prompt_digest = _build_prompt_digest(snapshot, family_hint)
    runtime_meta: dict[str, str] = resolve_runtime_model_meta()
    all_reports: list[dict[str, Any]] = []
    draft_candidate: dict[str, Any] = {}

    try:
        draft_candidate, runtime_meta = await generate_animation_runtime_plan_with_llm(
            snapshot,
            family_hint=family_hint,
            prompt_digest=prompt_digest,
        )
    except Exception as exc:
        _, provider_report = classify_generation_exception(exc)
        return finalize_error_snapshot(
            snapshot,
            family_hint=family_hint,
            prompt_digest=prompt_digest,
            runtime_draft=None,
            runtime_graph=None,
            runtime_attempt_count=1,
            runtime_meta=runtime_meta,
            validation_report=[provider_report],
            scene_outline=build_scene_outline(snapshot),
        )

    attempt_count = 1
    for attempt_index in range(MAX_RUNTIME_REPAIR_ATTEMPTS + 1):
        validation_report: list[dict[str, Any]] = []
        try:
            draft_model = ExplainerDraftV1.model_validate(draft_candidate)
            schema_draft = draft_model.model_dump(mode="python")
        except ValidationError as exc:
            schema_draft = {}
            for item in exc.errors():
                location = ".".join(str(part) for part in item.get("loc") or [])
                message = item.get("msg") or "Invalid explainer draft."
                validation_report.append(
                    report(
                        "draft_schema_error",
                        f"{location}: {message}" if location else message,
                        rule_id="runtime-draft-schema-error",
                    )
                )

        all_reports.extend(validation_report)
        if schema_draft:
            semantic_errors = validate_explainer_draft(schema_draft, snapshot, family_hint)
            validation_report.extend(
                [
                    {**item, "stage": "draft_semantic_error"}
                    if item.get("stage") == "draft_semantic"
                    else item
                    for item in semantic_errors
                ]
            )
            all_reports.extend(validation_report[len(all_reports) - len(validation_report) :])

            if not semantic_errors:
                try:
                    assembled_graph = assemble_generic_explainer_graph(
                        snapshot,
                        schema_draft,
                        family_hint,
                    )
                except Exception as exc:
                    assembly_errors = [
                        report(
                            "graph_assembly_error",
                            str(exc),
                            rule_id="runtime-graph-assembly-error",
                        )
                    ]
                    validation_report.extend(assembly_errors)
                    all_reports.extend(assembly_errors)
                else:
                    graph_semantic_errors = validate_generic_explainer_graph(
                        assembled_graph,
                        family_hint,
                    )
                    validation_report.extend(graph_semantic_errors)
                    all_reports.extend(graph_semantic_errors)

            if not validation_report:
                runtime_graph = GenericExplainerGraphV1.model_validate(assembled_graph)
                component_code = compile_runtime_graph_to_component_code(runtime_graph)
                compile_errors = validate_runtime_component_code(component_code)
                if not compile_errors:
                    success_reports = [
                        *all_reports,
                        report(
                            "compile",
                            "Generic explainer graph compiled successfully.",
                            rule_id="runtime-compiled",
                        ),
                    ]
                    return finalize_success_snapshot(
                        snapshot,
                        family_hint=family_hint,
                        prompt_digest=prompt_digest,
                        runtime_draft=schema_draft,
                        runtime_graph=runtime_graph,
                        component_code=component_code,
                        runtime_attempt_count=attempt_count,
                        runtime_meta=runtime_meta,
                        validation_report=success_reports,
                    )
                validation_report.extend(
                    [
                        report(
                            "runtime_compile_error",
                            item.get("message") or "Runtime compile failed.",
                            rule_id=item.get("rule_id")
                            if isinstance(item.get("rule_id"), str)
                            else None,
                            line=item.get("line") if isinstance(item.get("line"), int) else None,
                            column=item.get("column")
                            if isinstance(item.get("column"), int)
                            else None,
                        )
                        for item in compile_errors
                    ]
                )
                all_reports.extend(validation_report)

        if attempt_index >= MAX_RUNTIME_REPAIR_ATTEMPTS:
            exhausted_reports = [
                *all_reports,
                report(
                    "repair_exhausted",
                    "Explainer draft failed validation after maximum repair attempts.",
                    rule_id="runtime_repair_exhausted",
                ),
            ]
            return finalize_error_snapshot(
                snapshot,
                family_hint=family_hint,
                prompt_digest=prompt_digest,
                runtime_draft=draft_candidate,
                runtime_graph=assembled_graph if "assembled_graph" in locals() else None,
                runtime_attempt_count=attempt_count,
                runtime_meta=runtime_meta,
                validation_report=exhausted_reports,
                scene_outline=build_scene_outline(snapshot),
            )

        draft_candidate, runtime_meta = await repair_animation_runtime_plan_with_llm(
            snapshot,
            family_hint=family_hint,
            prompt_digest=prompt_digest,
            current_plan=schema_draft or draft_candidate or build_explainer_draft_seed(snapshot, family_hint),
            validation_errors=validation_report or all_reports,
        )
        attempt_count += 1

    return finalize_error_snapshot(
        snapshot,
        family_hint=family_hint,
        prompt_digest=prompt_digest,
        runtime_draft=draft_candidate,
        runtime_graph=assembled_graph if "assembled_graph" in locals() else None,
        runtime_attempt_count=attempt_count,
        runtime_meta=runtime_meta,
        validation_report=all_reports,
        scene_outline=build_scene_outline(snapshot),
    )


def enrich_animation_runtime_snapshot(content: dict[str, Any]) -> dict[str, Any]:
    try:
        return asyncio.run(enrich_animation_runtime_snapshot_async(content))
    except RuntimeError as exc:
        raise RuntimeError(
            "enrich_animation_runtime_snapshot() cannot be called from an active event loop. "
            "Use enrich_animation_runtime_snapshot_async() instead."
        ) from exc
