"""Unit tests for StateTransitionGuard."""

from services.platform.state_transition_guard import (
    GenerationCommandType,
    GenerationState,
    StateTransitionGuard,
)


def test_validate_allows_confirm_outline_from_awaiting():
    guard = StateTransitionGuard()

    result = guard.validate(
        GenerationState.AWAITING_OUTLINE_CONFIRM.value,
        GenerationCommandType.CONFIRM_OUTLINE.value,
    )

    assert result.allowed is True
    assert result.from_state == GenerationState.AWAITING_OUTLINE_CONFIRM.value
    assert result.to_state == GenerationState.GENERATING_CONTENT.value
    assert result.validated_by == "StateTransitionGuard"


def test_validate_rejects_invalid_transition():
    guard = StateTransitionGuard()

    result = guard.validate(
        GenerationState.IDLE.value,
        GenerationCommandType.CONFIRM_OUTLINE.value,
    )

    assert result.allowed is False
    assert result.to_state is None
    assert result.reject_reason


def test_get_allowed_actions_for_success():
    actions = StateTransitionGuard.get_allowed_actions(GenerationState.SUCCESS.value)
    assert actions == ["regenerate_slide", "export", "set_session_title"]


def test_get_transitions_exposes_public_transition_table():
    transitions = StateTransitionGuard.get_transitions()
    assert isinstance(transitions, list)
    assert {
        "command_type": GenerationCommandType.CONFIRM_OUTLINE.value,
        "from_state": GenerationState.AWAITING_OUTLINE_CONFIRM.value,
        "to_state": GenerationState.GENERATING_CONTENT.value,
    } in transitions


def test_validate_regenerate_slide_transitions_success_to_rendering():
    guard = StateTransitionGuard()
    result = guard.validate(
        GenerationState.SUCCESS.value,
        GenerationCommandType.REGENERATE_SLIDE.value,
    )
    assert result.allowed is True
    assert result.to_state == GenerationState.RENDERING.value


def test_validate_regenerate_slide_transitions_failed_to_rendering():
    guard = StateTransitionGuard()
    result = guard.validate(
        GenerationState.FAILED.value,
        GenerationCommandType.REGENERATE_SLIDE.value,
    )
    assert result.allowed is True
    assert result.to_state == GenerationState.RENDERING.value


def test_validate_resume_session_transitions_failed_to_configuring():
    guard = StateTransitionGuard()
    result = guard.validate(
        GenerationState.FAILED.value,
        GenerationCommandType.RESUME_SESSION.value,
    )
    assert result.allowed is True
    assert result.to_state == GenerationState.CONFIGURING.value


def test_validate_teaching_brief_confirm_transitions_to_configuring():
    guard = StateTransitionGuard()
    result = guard.validate(
        GenerationState.AWAITING_REQUIREMENTS_CONFIRM.value,
        GenerationCommandType.CONFIRM_TEACHING_BRIEF.value,
    )
    assert result.allowed is True
    assert result.to_state == GenerationState.CONFIGURING.value


def test_get_allowed_actions_for_requirements_confirm_state():
    actions = StateTransitionGuard.get_allowed_actions(
        GenerationState.AWAITING_REQUIREMENTS_CONFIRM.value
    )
    assert actions == [
        "update_teaching_brief",
        "confirm_teaching_brief",
        "set_session_title",
    ]


def test_get_allowed_actions_for_failed_state_include_regenerate_slide():
    actions = StateTransitionGuard.get_allowed_actions(GenerationState.FAILED.value)
    assert actions == [
        "regenerate_slide",
        "resume_session",
        "set_session_title",
    ]
