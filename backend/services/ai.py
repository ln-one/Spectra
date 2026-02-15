import logging
import os
from typing import Optional

from litellm import acompletion

logger = logging.getLogger(__name__)


class AIService:
    """Service for AI operations using LiteLLM"""

    def __init__(self):
        self.default_model = "gpt-3.5-turbo"

    async def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        max_tokens: Optional[int] = 500,
    ) -> dict:
        """
        Generate AI content using LiteLLM

        Args:
            prompt: The input prompt
            model: The model to use (defaults to gpt-3.5-turbo)
            max_tokens: Maximum tokens to generate

        Returns:
            dict with 'content', 'model', and 'tokens_used'
        """
        try:
            response = await acompletion(
                model=model or self.default_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
            )

            content = response.choices[0].message.content
            tokens_used = (
                response.usage.total_tokens if hasattr(response, "usage") else None
            )

            return {
                "content": content,
                "model": model or self.default_model,
                "tokens_used": tokens_used,
            }
        except Exception as e:
            # Log the error for debugging and monitoring
            logger.warning(f"AI generation failed: {str(e)}", exc_info=True)
            # Return a stub response if API call fails
            return {
                "content": f"AI stub response for prompt: {prompt[:50]}...",
                "model": model or self.default_model,
                "tokens_used": 0,
            }


# Global AI service instance
ai_service = AIService()
