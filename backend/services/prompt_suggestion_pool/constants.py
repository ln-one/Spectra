import os

from schemas.rag import PromptSuggestionSurface


def _env_int(name: str, default: int, *, minimum: int, maximum: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(minimum, min(value, maximum))


DEFAULT_PROMPT_SUGGESTION_POOL_SIZE = _env_int(
    "PROMPT_SUGGESTION_POOL_SIZE", 12, minimum=4, maximum=36
)
PROMPT_SUGGESTION_CACHE_TTL_SECONDS = int(
    os.getenv("PROMPT_SUGGESTION_CACHE_TTL_SECONDS", "86400")
)
ALL_PROMPT_SUGGESTION_SURFACES = tuple(PromptSuggestionSurface)
