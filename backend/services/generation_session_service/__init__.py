"""Session orchestration kernel for generation workflows.

``generation_session_service`` remains a Spectra-owned kernel organ. It owns
session/run/event orchestration, command/query flow, artifact binding, and
Diego runtime coordination, but it is not the formal PPT generation authority.

Formal PPT outline/generation authority lives in Diego.
"""

from importlib import import_module

__all__ = [
    "ai_service",
    "ConflictError",
    "GenerationSessionService",
    "_build_outline_requirements",
    "_default_capabilities",
    "_extract_outline_style",
]


def __getattr__(name):
    if name == "ai_service":
        module = import_module(".ai", "services")
        return getattr(module, name)
    if name in {
        "ConflictError",
        "GenerationSessionService",
        "_build_outline_requirements",
        "_default_capabilities",
        "_extract_outline_style",
    }:
        module = import_module(".service", __name__)
        return getattr(module, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
