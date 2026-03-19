"""AI service unified interface."""

import logging
import os
import time
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

from services.ai.intents import (
    classify_intent,
    classify_intent_by_keywords,
    parse_modify_intent,
    parse_modify_intent_by_keywords,
)
from services.ai.model_resolution import _resolve_model_name
from services.ai.rag_context import retrieve_rag_context
from services.courseware_ai import CoursewareAIMixin
from services.model_router import ModelRouter

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=BASE_DIR / ".env", override=False)


class AIService(CoursewareAIMixin):
    """Service for AI operations using LiteLLM."""

    def __init__(self):
        self.default_model = os.getenv("DEFAULT_MODEL", "qwen3.5-plus")
        self.large_model = os.getenv("LARGE_MODEL", self.default_model)
        self.small_model = os.getenv("SMALL_MODEL", self.default_model)
        self.model_router = ModelRouter(
            heavy_model=self.large_model,
            light_model=self.small_model,
        )
        self.allow_ai_stub = os.getenv("ALLOW_AI_STUB", "false").lower() == "true"

    async def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        route_task: Optional[str] = None,
        has_rag_context: bool = False,
        max_tokens: Optional[int] = 500,
    ) -> dict:
        started_at = time.perf_counter()

        def _elapsed_ms() -> float:
            return round((time.perf_counter() - started_at) * 1000.0, 2)

        route_decision = None
        requested_model = model
        if not requested_model:
            if route_task:
                route_decision = self.model_router.route(
                    route_task,
                    prompt=prompt,
                    has_rag_context=has_rag_context,
                )
                requested_model = route_decision.selected_model
            else:
                requested_model = self.default_model
        resolved_model = requested_model
        fallback_triggered = False
        fallback_model = route_decision.fallback_model if route_decision else None

        try:
            resolved_model = _resolve_model_name(requested_model)
            logger.info(
                "AI generate invoked: requested_model=%s resolved_model=%s "
                "route_task=%s",
                requested_model,
                resolved_model,
                route_task,
            )
            from services import ai as ai_module

            response = await ai_module.acompletion(
                model=resolved_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
            )
            content = response.choices[0].message.content
            tokens_used = (
                response.usage.total_tokens if hasattr(response, "usage") else None
            )
            latency_ms = _elapsed_ms()
            route_info = route_decision.to_dict() if route_decision else None
            if route_info is not None:
                route_info["latency_ms"] = latency_ms
            return {
                "content": content,
                "model": resolved_model,
                "tokens_used": tokens_used,
                "route": route_info,
                "fallback_triggered": fallback_triggered,
                "latency_ms": latency_ms,
            }
        except Exception as e:
            logger.warning(
                "AI generation failed with %s: %s",
                resolved_model,
                str(e),
                exc_info=True,
            )
            if fallback_model and fallback_model != requested_model:
                try:
                    fallback_resolved = _resolve_model_name(fallback_model)
                    logger.info(
                        "Attempting fallback: %s -> %s",
                        resolved_model,
                        fallback_resolved,
                    )
                    from services import ai as ai_module

                    response = await ai_module.acompletion(
                        model=fallback_resolved,
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=max_tokens,
                    )
                    content = response.choices[0].message.content
                    tokens_used = (
                        response.usage.total_tokens
                        if hasattr(response, "usage")
                        else None
                    )
                    fallback_triggered = True
                    route_info = route_decision.to_dict() if route_decision else {}
                    route_info["fallback_triggered"] = True
                    route_info["original_model"] = resolved_model
                    route_info["failure_reason"] = str(e)
                    route_info["latency_ms"] = _elapsed_ms()
                    return {
                        "content": content,
                        "model": fallback_resolved,
                        "tokens_used": tokens_used,
                        "route": route_info,
                        "fallback_triggered": fallback_triggered,
                        "latency_ms": route_info["latency_ms"],
                    }
                except Exception as fallback_exc:
                    logger.error(
                        "Fallback to %s also failed: %s",
                        fallback_model,
                        fallback_exc,
                        exc_info=True,
                    )

            if self.allow_ai_stub:
                latency_ms = _elapsed_ms()
                route_info = route_decision.to_dict() if route_decision else None
                if route_info is not None:
                    route_info["failure_reason"] = str(e)
                    route_info["latency_ms"] = latency_ms
                return {
                    "content": f"AI stub response for prompt: {prompt[:50]}...",
                    "model": resolved_model,
                    "tokens_used": 0,
                    "route": route_info,
                    "fallback_triggered": fallback_triggered,
                    "latency_ms": latency_ms,
                }
            raise

    async def classify_intent(self, user_message: str):
        return await classify_intent(self, user_message)

    @staticmethod
    def _classify_intent_by_keywords(message: str):
        return classify_intent_by_keywords(message)

    async def parse_modify_intent(self, instruction: str):
        return await parse_modify_intent(self, instruction)

    @staticmethod
    def _parse_modify_intent_by_keywords(instruction: str):
        return parse_modify_intent_by_keywords(instruction)

    async def _retrieve_rag_context(
        self, project_id: str, query: str, top_k: int = 5, score_threshold: float = 0.3
    ):
        return await retrieve_rag_context(
            self,
            project_id=project_id,
            query=query,
            top_k=top_k,
            score_threshold=score_threshold,
        )
