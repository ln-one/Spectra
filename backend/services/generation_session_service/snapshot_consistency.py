from __future__ import annotations

from typing import Any


class SnapshotContractError(Exception):
    """Raised when snapshot contract fields are semantically inconsistent."""

    def __init__(self, message: str, *, details: dict[str, Any]):
        super().__init__(message)
        self.details = details


def _normalize_reason(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def validate_session_snapshot_contract(
    *,
    session,
    snapshot: dict,
    latest_state_event=None,
) -> None:
    session_id = getattr(session, "id", None)
    session_state = getattr(session, "state", None)
    session_state_reason = _normalize_reason(getattr(session, "stateReason", None))

    anchor = snapshot.get("artifact_anchor") or {}
    artifact_id = snapshot.get("artifact_id")
    based_on_version_id = snapshot.get("based_on_version_id")

    if (
        anchor.get("session_id") != session_id
        or anchor.get("artifact_id") != artifact_id
        or anchor.get("based_on_version_id") != based_on_version_id
    ):
        raise SnapshotContractError(
            "会话快照 artifact_anchor 与顶层产物字段不一致",
            details={
                "reason": "artifact_anchor_mismatch",
                "session_id": session_id,
                "artifact_id": artifact_id,
                "based_on_version_id": based_on_version_id,
                "anchor": anchor,
            },
        )

    session_artifacts = snapshot.get("session_artifacts") or []
    if session_artifacts:
        latest_artifact = session_artifacts[0]
        if (
            latest_artifact.get("artifact_id") != artifact_id
            or latest_artifact.get("based_on_version_id") != based_on_version_id
        ):
            raise SnapshotContractError(
                "会话快照顶层产物与历史首项不一致",
                details={
                    "reason": "artifact_history_mismatch",
                    "artifact_id": artifact_id,
                    "based_on_version_id": based_on_version_id,
                    "latest_artifact": latest_artifact,
                },
            )

    if latest_state_event is None:
        return

    event_state = getattr(latest_state_event, "state", None)
    if event_state and event_state != session_state:
        raise SnapshotContractError(
            "会话状态与最新状态事件不一致",
            details={
                "reason": "state_event_mismatch",
                "session_state": session_state,
                "event_state": event_state,
            },
        )

    event_state_reason = _normalize_reason(
        getattr(latest_state_event, "stateReason", None)
    )
    if event_state_reason != session_state_reason:
        raise SnapshotContractError(
            "会话 state_reason 与最新状态事件不一致",
            details={
                "reason": "state_reason_event_mismatch",
                "session_state_reason": session_state_reason,
                "event_state_reason": event_state_reason,
            },
        )
