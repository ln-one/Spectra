from litellm import acompletion

from services.ai.model_resolution import _resolve_model_name
from services.ai.service import AIService

ai_service = AIService()

__all__ = ["AIService", "ai_service", "_resolve_model_name", "acompletion"]
