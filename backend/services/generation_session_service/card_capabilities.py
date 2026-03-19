from __future__ import annotations

from services.generation_session_service.card_catalog import CARD_CAPABILITIES
from services.generation_session_service.card_execution_plans import (
    CARD_EXECUTION_PLANS,
)

CARD_CAPABILITY_BY_ID = {card.id: card for card in CARD_CAPABILITIES}


def get_studio_card_capabilities() -> list[dict]:
    return [card.model_dump(mode="json") for card in CARD_CAPABILITIES]


def get_studio_card_capability(card_id: str) -> dict | None:
    card = CARD_CAPABILITY_BY_ID.get(card_id)
    if card is None:
        return None
    return card.model_dump(mode="json")


def get_studio_card_execution_plan(card_id: str) -> dict | None:
    plan = CARD_EXECUTION_PLANS.get(card_id)
    if plan is None:
        return None
    return plan.model_dump(mode="json")
