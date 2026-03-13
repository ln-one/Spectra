"""Unit tests for StateTransitionGuard."""

from services.state_transition_guard import StateTransitionGuard


def test_validate_allows_confirm_outline_from_awaiting():
    guard = StateTransitionGuard()

    result = guard.validate("AWAITING_OUTLINE_CONFIRM", "CONFIRM_OUTLINE")

    assert result.allowed is True
    assert result.from_state == "AWAITING_OUTLINE_CONFIRM"
    assert result.to_state == "GENERATING_CONTENT"
    assert result.validated_by == "StateTransitionGuard"


def test_validate_rejects_invalid_transition():
    guard = StateTransitionGuard()

    result = guard.validate("IDLE", "CONFIRM_OUTLINE")

    assert result.allowed is False
    assert result.to_state is None
    assert result.reject_reason


def test_get_allowed_actions_for_success():
    actions = StateTransitionGuard.get_allowed_actions("SUCCESS")
    assert actions == ["regenerate_slide", "export"]


def test_get_transitions_exposes_public_transition_table():
    transitions = StateTransitionGuard.get_transitions()
    assert isinstance(transitions, list)
    assert {
        "command_type": "CONFIRM_OUTLINE",
        "from_state": "AWAITING_OUTLINE_CONFIRM",
        "to_state": "GENERATING_CONTENT",
    } in transitions
