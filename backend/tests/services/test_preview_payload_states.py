from services.platform.state_transition_guard import GenerationState
from services.preview_helpers.payloads import (
    build_preview_payload,
    ensure_previewable_state,
)


def _snapshot(state: str) -> dict:
    return {"session": {"state": state}}


def test_ensure_previewable_state_allows_generation_and_failure_windows():
    for state in (
        GenerationState.DRAFTING_OUTLINE.value,
        GenerationState.AWAITING_OUTLINE_CONFIRM.value,
        GenerationState.GENERATING_CONTENT.value,
        GenerationState.RENDERING.value,
        GenerationState.SUCCESS.value,
        GenerationState.FAILED.value,
    ):
        ensure_previewable_state(_snapshot(state))


def test_ensure_previewable_state_rejects_unsupported_state():
    try:
        ensure_previewable_state(_snapshot("UNKNOWN_STATE"))
    except ValueError as exc:
        assert "不支持预览" in str(exc)
    else:  # pragma: no cover - defensive
        raise AssertionError("expected ValueError for unsupported preview state")


def test_build_preview_payload_includes_markdown_content_when_available():
    payload = build_preview_payload(
        session_id="session-001",
        snapshot={"session": {"render_version": 3}},
        task=None,
        slides=[],
        lesson_plan=None,
        anchor={"artifact_id": "artifact-001", "based_on_version_id": None},
        content={"markdown_content": "# Deck\n\n## Slide 1"},
        rendered_preview=None,
    )

    assert payload["slides_content_markdown"] == "# Deck\n\n## Slide 1"
    assert payload["slides_content_ready"] is True
