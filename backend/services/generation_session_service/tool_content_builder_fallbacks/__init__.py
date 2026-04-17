"""Studio card query helpers.

User-visible template fallbacks were removed from the formal Studio generation
path. AI generation must succeed or return a structured failure.
"""

from .common import SUPPORTED_CARD_IDS, card_query_text

__all__ = [
    "SUPPORTED_CARD_IDS",
    "card_query_text",
]
