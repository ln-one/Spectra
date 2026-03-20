from importlib import import_module

from .service import (
    ConflictError,
    GenerationSessionService,
    _build_outline_requirements,
    _default_capabilities,
    _extract_outline_style,
)

__all__ = [
    "ai_service",
    "ConflictError",
    "GenerationSessionService",
    "_build_outline_requirements",
    "_default_capabilities",
    "_extract_outline_style",
]


def __getattr__(name):
    if name != "ai_service":
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module = import_module(".ai", "services")
    return getattr(module, name)
