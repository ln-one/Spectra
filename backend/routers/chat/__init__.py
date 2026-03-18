"""Chat router package."""

from . import voice  # noqa: F401  # ensure routes register
from .messages import router

__all__ = ["router"]
