from __future__ import annotations

from typing import Any, Optional

from services.generation_session_service.teaching_brief import _normalize_text


def remove_proposal_by_id(
    proposals: list[dict[str, Any]],
    proposal_id: str,
) -> tuple[list[dict[str, Any]], Optional[dict[str, Any]]]:
    normalized_id = _normalize_text(proposal_id)
    kept: list[dict[str, Any]] = []
    removed: Optional[dict[str, Any]] = None
    for proposal in proposals:
        current_id = _normalize_text(proposal.get("proposal_id"))
        if removed is None and current_id == normalized_id:
            removed = proposal
            continue
        kept.append(proposal)
    return kept, removed
