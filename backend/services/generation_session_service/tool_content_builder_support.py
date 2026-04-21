from __future__ import annotations

import json
from typing import Any

from services.generation_session_service.interactive_games_legacy_adapter import (
    resolve_interactive_game_schema_hint,
)
from services.generation_session_service.mindmap_normalizer import (
    build_mindmap_schema_hint,
)
from services.generation_session_service.quiz_normalizer import (
    build_quiz_schema_hint,
)
from services.generation_session_service.word_document_normalizer import (
    resolve_word_document_schema_hint,
)
from utils.exceptions import APIException, ErrorCode

_PAYLOAD_REQUIREMENTS: dict[str, tuple[str, ...]] = {
    "courseware_ppt": ("title", "summary"),
    "word_document": ("title", "summary", "layout_payload"),
    "knowledge_mindmap": ("title", "nodes"),
    "interactive_quick_quiz": ("title", "questions"),
    "interactive_games": ("title", "html"),
    "classroom_qa_simulator": ("title", "turns"),
    "demonstration_animations": (),
    "speaker_notes": ("title", "slides", "anchors"),
}


def infer_provider(model_name: str | None) -> str:
    model = str(model_name or "").strip()
    if not model:
        return "unknown"
    return model.split("/", 1)[0]


def build_error_details(
    *,
    card_id: str,
    model: str | None,
    phase: str,
    failure_reason: str,
    retryable: bool,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "card_id": card_id,
        "provider": infer_provider(model),
        "model": model or "unknown",
        "phase": phase,
        "failure_reason": failure_reason,
        "retryable": retryable,
    }
    if extra:
        payload.update(extra)
    return payload


def raise_generation_error(
    *,
    status_code: int,
    error_code: ErrorCode,
    message: str,
    card_id: str,
    model: str | None,
    phase: str,
    failure_reason: str,
    retryable: bool,
    extra: dict[str, Any] | None = None,
) -> None:
    raise APIException(
        status_code=status_code,
        error_code=error_code,
        message=message,
        details=build_error_details(
            card_id=card_id,
            model=model,
            phase=phase,
            failure_reason=failure_reason,
            retryable=retryable,
            extra=extra,
        ),
        retryable=retryable,
    )


def strip_json_fence(text: str) -> str:
    candidate = (text or "").strip()
    if candidate.startswith("```"):
        lines = candidate.splitlines()
        if len(lines) >= 3:
            candidate = "\n".join(lines[1:-1]).strip()
    return candidate


def _extract_first_json_object(text: str) -> str | None:
    candidate = (text or "").strip()
    if not candidate:
        return None
    decoder = json.JSONDecoder()
    try:
        parsed, end = decoder.raw_decode(candidate)
        if isinstance(parsed, dict):
            return candidate[:end]
    except json.JSONDecodeError:
        pass

    start = candidate.find("{")
    while start != -1:
        fragment = candidate[start:]
        try:
            parsed, end = decoder.raw_decode(fragment)
        except json.JSONDecodeError:
            start = candidate.find("{", start + 1)
            continue
        if isinstance(parsed, dict):
            return fragment[:end]
        start = candidate.find("{", start + 1)
    return None


def require_non_empty_str(payload: dict[str, Any], key: str) -> None:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"field_{key}_empty")


def require_non_empty_list(payload: dict[str, Any], key: str) -> None:
    value = payload.get(key)
    if not isinstance(value, list) or not value:
        raise ValueError(f"field_{key}_empty")


def validate_card_payload(card_id: str, payload: dict[str, Any]) -> None:
    required_keys = _PAYLOAD_REQUIREMENTS.get(card_id, ())
    for key in required_keys:
        if key not in payload:
            raise ValueError(f"missing_field_{key}")
    if card_id == "knowledge_mindmap":
        require_non_empty_str(payload, "title")
        require_non_empty_list(payload, "nodes")
    elif card_id == "interactive_quick_quiz":
        require_non_empty_str(payload, "title")
        require_non_empty_list(payload, "questions")
    elif card_id == "interactive_games":
        require_non_empty_str(payload, "title")
        require_non_empty_str(payload, "html")
    elif card_id == "classroom_qa_simulator":
        require_non_empty_str(payload, "title")
        require_non_empty_list(payload, "turns")
    elif card_id == "demonstration_animations":
        title = payload.get("title")
        topic = payload.get("topic")
        summary = payload.get("summary")
        focus = payload.get("focus")
        motion_brief = payload.get("motion_brief")
        has_descriptive_text = any(
            isinstance(value, str) and value.strip()
            for value in (title, topic, summary, focus, motion_brief)
        )
        if isinstance(payload.get("steps"), list) and payload.get("steps"):
            return
        scenes = payload.get("scenes")
        if isinstance(scenes, list) and scenes:
            return
        runtime_graph = payload.get("runtime_graph")
        if isinstance(runtime_graph, dict):
            graph_steps = runtime_graph.get("steps")
            if isinstance(graph_steps, list) and graph_steps:
                return
        runtime_draft = payload.get("runtime_draft")
        if isinstance(runtime_draft, dict):
            step_captions = runtime_draft.get("step_captions")
            if isinstance(step_captions, list) and step_captions:
                return
        if has_descriptive_text:
            return
        raise ValueError("field_animation_runtime_empty")
    elif card_id == "speaker_notes":
        require_non_empty_str(payload, "title")
        require_non_empty_list(payload, "slides")
        require_non_empty_list(payload, "anchors")
    elif card_id in {"courseware_ppt", "word_document"}:
        require_non_empty_str(payload, "title")
        require_non_empty_str(payload, "summary")
        if card_id == "word_document":
            layout_payload = payload.get("layout_payload")
            if not isinstance(layout_payload, dict) or not layout_payload:
                raise ValueError("field_layout_payload_empty")


def validate_simulator_turn_payload(payload: dict[str, Any]) -> None:
    updated = payload.get("updated_content")
    turn_result = payload.get("turn_result")
    if not isinstance(updated, dict):
        raise ValueError("missing_updated_content")
    if not isinstance(turn_result, dict):
        raise ValueError("missing_turn_result")
    validate_card_payload("classroom_qa_simulator", updated)
    for required in (
        "turn_anchor",
        "student_profile",
        "student_question",
        "feedback",
    ):
        value = turn_result.get(required)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"missing_turn_result_{required}")


def parse_ai_object_payload(
    *,
    card_id: str,
    ai_raw: str,
    model: str | None,
    phase: str,
) -> dict[str, Any]:
    normalized = strip_json_fence(ai_raw)
    recovered = _extract_first_json_object(normalized)
    try:
        parsed = json.loads(normalized)
    except Exception as exc:
        if not recovered:
            raise_generation_error(
                status_code=502,
                error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                message="AI returned non-JSON content for studio card generation.",
                card_id=card_id,
                model=model,
                phase=phase,
                failure_reason="parse_json_failed",
                retryable=True,
                extra={"raw_error": str(exc)[:300]},
            )
        try:
            parsed = json.loads(recovered)
        except Exception as recovered_exc:
            raise_generation_error(
                status_code=502,
                error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                message="AI returned non-JSON content for studio card generation.",
                card_id=card_id,
                model=model,
                phase=phase,
                failure_reason="parse_json_failed",
                retryable=True,
                extra={"raw_error": str(recovered_exc)[:300]},
            )
    if not isinstance(parsed, dict):
        raise_generation_error(
            status_code=502,
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            message="AI returned a non-object payload for studio card generation.",
            card_id=card_id,
            model=model,
            phase=phase,
            failure_reason="payload_not_object",
            retryable=True,
        )
    return parsed


def build_schema_hint(card_id: str, config: dict[str, Any] | None = None) -> str | None:
    if card_id == "interactive_games":
        return resolve_interactive_game_schema_hint(config)

    return {
        "courseware_ppt": (
            '{"title":"", "summary":"", "pages":12, "template":"default"}'
        ),
        "word_document": resolve_word_document_schema_hint(config),
        "knowledge_mindmap": build_mindmap_schema_hint(config),
        "interactive_quick_quiz": build_quiz_schema_hint(config),
        "classroom_qa_simulator": (
            '{"title":"", "summary":"", "key_points":[""], '
            '"turns":[{"student":"","question":"","teacher_hint":"",'
            '"feedback":""}]}'
        ),
        "demonstration_animations": (
            '{"kind":"animation_storyboard", "title":"", "topic":"", "summary":"", '
            '"runtime_graph_version":"generic_explainer_graph.v1", '
            '"runtime_graph":{"family_hint":"algorithm_demo","timeline":{"total_steps":1},"steps":[{"primary_caption":{"title":"","body":""},"entities":[{"id":"subject-0","kind":"track_stack"}]}]}, '
            '"runtime_draft_version":"explainer_draft.v1", '
            '"runtime_draft":{"family_hint":"algorithm_demo","step_captions":[{"caption_title":"","caption_body":""}]}, '
            '"component_code":"export default function Animation(runtimeProps) { ... }", '
            '"runtime_source":"llm_draft_assembled_graph", '
            '"runtime_contract":"animation_runtime.v4", '
            '"compile_status":"pending", '
            '"compile_errors":[]}'
        ),
        "speaker_notes": (
            '{"title":"", "summary":"", "source_artifact_id":"", '
            '"slides":[{"id":"slide-1","page":1,"title":"",'
            '"sections":[{"id":"slide-1-section-1","title":"开场","paragraphs":'
            '[{"id":"slide-1-paragraph-1","anchor_id":"speaker_notes:v2:slide-1:paragraph-1","text":"","role":"script"}]}]}],'
            '"anchors":[{"scope":"paragraph","anchor_id":"speaker_notes:v2:slide-1:paragraph-1","slide_id":"slide-1","paragraph_id":"slide-1-paragraph-1","label":"第 1 页正文"}]}'
        ),
    }.get(card_id)
