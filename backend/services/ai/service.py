"""AI service unified interface."""

import asyncio
import logging
import os
import time
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

from services.ai.completion_runtime import (
    build_completion_payload,
    build_stub_payload,
    extract_completion_payload,
    with_route_failure,
)
from services.ai.intents import (
    classify_intent,
    classify_intent_by_keywords,
    parse_modify_intent,
    parse_modify_intent_by_keywords,
)
from services.ai.model_resolution import _resolve_model_name
from services.ai.model_router import (
    ModelRouteFailureReason,
    ModelRouter,
    ModelRouteTask,
)
from services.ai.rag_context import retrieve_rag_context
from services.courseware_ai import CoursewareAIMixin

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=BASE_DIR / ".env", override=False)


class AIService(CoursewareAIMixin):
    """Service for AI operations using LiteLLM."""

    def __init__(self):
        self.default_model = os.getenv("DEFAULT_MODEL", "qwen3.5-plus")
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

    def _resolve_timeout_seconds(
        self, route_task: Optional[ModelRouteTask | str]
    ) -> float:
        normalized_route_task = (
            route_task.value if isinstance(route_task, ModelRouteTask) else route_task
        )
        if normalized_route_task == ModelRouteTask.CHAT_RESPONSE.value:
            return self.chat_request_timeout_seconds
        return self.request_timeout_seconds

    async def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        route_task: Optional[ModelRouteTask | str] = None,
        has_rag_context: bool = False,
        max_tokens: Optional[int] = 500,
    ) -> dict:
        started_at = time.perf_counter()

        def _elapsed_ms() -> float:
            return round((time.perf_counter() - started_at) * 1000.0, 2)

        route_decision = None
        requested_model = model
        normalized_route_task = (
            route_task.value if isinstance(route_task, ModelRouteTask) else route_task
        )
        if not requested_model:
            if normalized_route_task:
                route_decision = self.model_router.route(
                    normalized_route_task,
                    prompt=prompt,
                    has_rag_context=has_rag_context,
                )
                requested_model = route_decision.selected_model
            else:
                requested_model = self.default_model
        resolved_model = requested_model
        fallback_triggered = False
        fallback_model = route_decision.fallback_model if route_decision else None
        timeout_seconds = self._resolve_timeout_seconds(route_task)

        try:
            resolved_model = _resolve_model_name(requested_model)
            logger.info(
                "AI generate invoked: requested_model=%s resolved_model=%s "
                "route_task=%s timeout_seconds=%s",
                requested_model,
                resolved_model,
                normalized_route_task,
                timeout_seconds,
            )
            response = await self._run_completion(
                model=resolved_model,
                prompt=prompt,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
            )
            content, tokens_used = extract_completion_payload(response)
            latency_ms = _elapsed_ms()
            route_info = route_decision.to_dict() if route_decision else None
            if route_info is not None:
                route_info["latency_ms"] = latency_ms
            return build_completion_payload(
                content=content,
                model=resolved_model,
                tokens_used=tokens_used,
                route=route_info,
                fallback_triggered=fallback_triggered,
                latency_ms=latency_ms,
            )
        except asyncio.TimeoutError as e:
            logger.warning(
                "AI generation timed out after %.1fs with %s",
                timeout_seconds,
                resolved_model,
                exc_info=True,
            )
            if fallback_model and fallback_model != requested_model:
                try:
                    fallback_resolved = _resolve_model_name(fallback_model)
                    logger.info(
                        "Attempting fallback after timeout: %s -> %s",
                        resolved_model,
                        fallback_resolved,
                    )
                    response = await self._run_completion(
                        model=fallback_resolved,
                        prompt=prompt,
                        max_tokens=max_tokens,
                        timeout_seconds=timeout_seconds,
                    )
                    content, tokens_used = extract_completion_payload(response)
                    fallback_triggered = True
                    route_info = (
                        with_route_failure(
                            route_decision,
                            failure_reason=ModelRouteFailureReason.TIMEOUT,
                            latency_ms=_elapsed_ms(),
                            fallback_triggered=True,
                            original_model=resolved_model,
                        )
                        or {}
                    )
                    return build_completion_payload(
                        content=content,
                        model=fallback_resolved,
                        tokens_used=tokens_used,
                        route=route_info,
                        fallback_triggered=fallback_triggered,
                        latency_ms=route_info["latency_ms"],
                    )
                except Exception as fallback_exc:
                    logger.error(
                        "Fallback to %s after timeout also failed: %s",
                        fallback_model,
                        fallback_exc,
                        exc_info=True,
                    )

            if self.allow_ai_stub:
                latency_ms = _elapsed_ms()
                route_info = with_route_failure(
                    route_decision,
                    failure_reason=ModelRouteFailureReason.TIMEOUT,
                    latency_ms=latency_ms,
                )
                return build_stub_payload(
                    prompt=prompt,
                    model=resolved_model,
                    route=route_info,
                    fallback_triggered=fallback_triggered,
                    latency_ms=latency_ms,
                )
            raise TimeoutError(
                f"AI request timed out after {timeout_seconds:.1f}s"
            ) from e
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
                    response = await self._run_completion(
                        model=fallback_resolved,
                        prompt=prompt,
                        max_tokens=max_tokens,
                        timeout_seconds=timeout_seconds,
                    )
                    content, tokens_used = extract_completion_payload(response)
                    fallback_triggered = True
                    route_info = (
                        with_route_failure(
                            route_decision,
                            failure_reason=ModelRouteFailureReason.COMPLETION_ERROR,
                            latency_ms=_elapsed_ms(),
                            fallback_triggered=True,
                            original_model=resolved_model,
                        )
                        or {}
                    )
                    return build_completion_payload(
                        content=content,
                        model=fallback_resolved,
                        tokens_used=tokens_used,
                        route=route_info,
                        fallback_triggered=fallback_triggered,
                        latency_ms=route_info["latency_ms"],
                    )
                except Exception as fallback_exc:
                    logger.error(
                        "Fallback to %s also failed: %s",
                        fallback_model,
                        fallback_exc,
                        exc_info=True,
                    )

            if self.allow_ai_stub:
                latency_ms = _elapsed_ms()
                route_info = with_route_failure(
                    route_decision,
                    failure_reason=ModelRouteFailureReason.COMPLETION_ERROR,
                    latency_ms=latency_ms,
                )
                return build_stub_payload(
                    prompt=prompt,
                    model=resolved_model,
                    route=route_info,
                    fallback_triggered=fallback_triggered,
                    latency_ms=latency_ms,
                )
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
