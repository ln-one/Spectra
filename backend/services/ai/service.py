"""AI service unified interface."""

import asyncio
import base64
import logging
import mimetypes
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

from services.ai.generate_runtime import generate_with_routing
from services.ai.model_resolution import _resolve_model_name
from services.ai.model_router import ModelRouter, ModelRouteTask
from services.ai.service_intents import (
    classify_intent_with_service,
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
            os.getenv("AI_REQUEST_TIMEOUT_SECONDS", "240")
        )
        self.chat_request_timeout_seconds = float(
            os.getenv("CHAT_RESPONSE_TIMEOUT_SECONDS", "300")
        )
        self.model_router = ModelRouter(
            heavy_model=self.large_model,
            light_model=self.small_model,
        )
        self.allow_ai_stub = os.getenv("ALLOW_AI_STUB", "false").lower() == "true"
        self.upstream_retry_attempts = resolve_upstream_retry_attempts()
        self.upstream_retry_delay_seconds = resolve_upstream_retry_delay_seconds()

    def apply_runtime_overrides(
        self,
        *,
        default_model: Optional[str] = None,
        large_model: Optional[str] = None,
        small_model: Optional[str] = None,
        ai_request_timeout_seconds: Optional[float] = None,
        chat_timeout_seconds: Optional[float] = None,
    ) -> None:
        """Apply runtime overrides for model/timeouts and refresh router."""
        if default_model:
            self.default_model = default_model
        if large_model:
            self.large_model = large_model
        if small_model:
            self.small_model = small_model
        if ai_request_timeout_seconds is not None:
            self.request_timeout_seconds = float(ai_request_timeout_seconds)
        if chat_timeout_seconds is not None:
            self.chat_request_timeout_seconds = float(chat_timeout_seconds)

        self.model_router = ModelRouter(
            heavy_model=self.large_model,
            light_model=self.small_model,
        )

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

    async def _run_multimodal_completion(
        self,
        *,
        model: str,
        messages: list[dict],
        max_tokens: Optional[int],
        timeout_seconds: float,
    ):
        from services.ai import acompletion

        return await asyncio.wait_for(
            acompletion(
                model=model,
                messages=messages,
                max_tokens=max_tokens,
            ),
            timeout=timeout_seconds,
        )

    @staticmethod
    def _build_image_data_url(filepath: str) -> str | None:
        try:
            path = Path(filepath)
            if not path.exists() or not path.is_file():
                return None
            # Keep payload bounded for upstream multimodal providers.
            if path.stat().st_size > 4 * 1024 * 1024:
                return None
            mime_type, _ = mimetypes.guess_type(str(path))
            if not mime_type:
                mime_type = "image/png"
            encoded = base64.b64encode(path.read_bytes()).decode("ascii")
            return f"data:{mime_type};base64,{encoded}"
        except Exception:
            return None

    @staticmethod
    def _extract_multimodal_text(response) -> str:
        message = response.choices[0].message
        content = getattr(message, "content", "")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict):
                    text = item.get("text")
                    if isinstance(text, str) and text.strip():
                        parts.append(text.strip())
            return "\n".join(parts).strip()
        return str(content or "").strip()

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

    async def analyze_images_for_chat(
        self,
        *,
        user_message: str,
        image_inputs: list[dict[str, str]],
        max_tokens: int = 400,
    ) -> dict | None:
        if not image_inputs:
            return None

        vision_model = os.getenv("VISION_MODEL", self.large_model).strip()
        resolved_model = _resolve_model_name(vision_model)
        timeout_seconds = self._resolve_timeout_seconds(ModelRouteTask.CHAT_RESPONSE)

        content_blocks: list[dict] = [
            {
                "type": "text",
                "text": (
                    "你是教学助理，请只基于图片可见内容做事实描述。"
                    "请提取图中关键标签、字段、箭头关系、对比要点，"
                    "输出 4-8 条简明要点。若图片不清晰请明确说明。"
                    f"\n用户问题：{user_message}"
                ),
            }
        ]
        attached_images = 0
        for item in image_inputs[:2]:
            data_url = self._build_image_data_url(str(item.get("filepath") or ""))
            if not data_url:
                continue
            content_blocks.append({"type": "image_url", "image_url": {"url": data_url}})
            attached_images += 1

        if attached_images == 0:
            return {"reason": "no_usable_image_payload"}

        try:
            response = await self._run_multimodal_completion(
                model=resolved_model,
                messages=[{"role": "user", "content": content_blocks}],
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
            )
            text = self._extract_multimodal_text(response)
            if not text:
                return {"reason": "empty_vision_response", "model": resolved_model}
            return {
                "content": text,
                "model": resolved_model,
                "image_count": attached_images,
            }
        except Exception as exc:
            logger.warning(
                "chat image analysis skipped: model=%s error=%s",
                resolved_model,
                exc,
            )
            return {"reason": "vision_completion_error", "model": resolved_model}

    _retrieve_rag_context = retrieve_rag_context_bound
