import os

from schemas.rag import PromptSuggestionSurface

DEFAULT_PROMPT_SUGGESTION_POOL_SIZE = 36
PROMPT_SUGGESTION_CACHE_TTL_SECONDS = int(
    os.getenv("PROMPT_SUGGESTION_CACHE_TTL_SECONDS", "86400")
)
ALL_PROMPT_SUGGESTION_SURFACES = tuple(PromptSuggestionSurface)
