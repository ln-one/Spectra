from litellm import acompletion

from services.ai.model_resolution import _resolve_model_name
from services.ai.model_router import ModelRouter, ModelRouteTask, RouteDecision
from services.ai.service import AIService

ai_service = AIService()

__all__ = [
    "AIService",
    "ModelRouter",
    "ModelRouteTask",
    "RouteDecision",
    "ai_service",
    "_resolve_model_name",
    "acompletion",
]
