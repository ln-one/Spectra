"""AI service unified interface."""

import asyncio
import logging
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

from services.ai.generate_runtime import generate_with_routing
from services.ai.model_router import ModelRouter, ModelRouteTask
from services.ai.service_intents import (
    classify_intent_by_keywords_only,
    classify_intent_with_service,
    parse_modify_intent_by_keywords_only,
    parse_modify_intent_with_service,
    retrieve_rag_context_bound,
)
from services.ai.service_support import (
    resolve_timeout_seconds,
    resolve_upstream_retry_attempts,
    resolve_upstream_retry_delay_seconds,
)
from services.courseware_ai import CoursewareAIMixin

logger = logging.getLogger(__name__)
BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=BASE_DIR / ".env", override=False)


class AIService(CoursewareAIMixin):
    """Service for AI operations using LiteLLM."""

    def __init__(self):
        self.default_model = os.getenv("DEFAULT_MODEL", "qwen3.5-flash")
        self.large_model = os.getenv("LARGE_MODEL", self.default_model)
        self.small_model = os.getenv("SMALL_MODEL", self.default_model)
        self.request_timeout_seconds = float(
            os.getenv("AI_REQUEST_TIMEOUT_SECONDS", "60")
        )
        self.chat_request_timeout_seconds = float(
            os.getenv("CHAT_RESPONSE_TIMEOUT_SECONDS", "90")
        )
        self.model_router = ModelRouter(
            heavy_model=self.large_model,
            light_model=self.small_model,
        )
        self.allow_ai_stub = os.getenv("ALLOW_AI_STUB", "false").lower() == "true"
        self.upstream_retry_attempts = resolve_upstream_retry_attempts()
        self.upstream_retry_delay_seconds = resolve_upstream_retry_delay_seconds()

    def _resolve_timeout_seconds(
        self, route_task: Optional[ModelRouteTask | str]
    ) -> float:
        return resolve_timeout_seconds(
            route_task,
            request_timeout_seconds=self.request_timeout_seconds,
            chat_request_timeout_seconds=self.chat_request_timeout_seconds,
        )

    async def _run_completion(
        self,
        *,
        model: str,
        prompt: str,
        max_tokens: Optional[int],
        timeout_seconds: float,
    ):
        from services.ai import acompletion

        return await asyncio.wait_for(
            acompletion(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
            ),
            timeout=timeout_seconds,
        )

    async def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        route_task: Optional[ModelRouteTask | str] = None,
        has_rag_context: bool = False,
        max_tokens: Optional[int] = 500,
    ) -> dict:
        return await generate_with_routing(
            self,
            prompt=prompt,
            model=model,
            route_task=route_task,
            has_rag_context=has_rag_context,
            max_tokens=max_tokens,
        )

    async def classify_intent(self, user_message: str):
        return await classify_intent_with_service(self, user_message)

    async def parse_modify_intent(self, instruction: str):
        return await parse_modify_intent_with_service(self, instruction)

    _classify_intent_by_keywords = staticmethod(classify_intent_by_keywords_only)
    _parse_modify_intent_by_keywords = staticmethod(
        parse_modify_intent_by_keywords_only
    )
    _retrieve_rag_context = retrieve_rag_context_bound
