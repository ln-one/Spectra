from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable, Optional

from services.ai.completion_runtime import should_retry_completion_error

CompletionRunner = Callable[..., Awaitable[Any]]


async def retry_transient_completion(
    *,
    run_completion: CompletionRunner,
    model: str,
    prompt: str,
    max_tokens: Optional[int],
    timeout_seconds: float,
    retry_attempts: int,
    retry_delay_seconds: float,
    logger: logging.Logger,
) -> tuple[Any, int]:
    last_exc: Exception | None = None

    for attempt in range(1, retry_attempts + 1):
        if retry_delay_seconds > 0:
            await asyncio.sleep(retry_delay_seconds)
        try:
            response = await run_completion(
                model=model,
                prompt=prompt,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
            )
            return response, attempt
        except Exception as exc:
            last_exc = exc
            logger.warning(
                "Retry %s/%s for provider model %s failed: %s",
                attempt,
                retry_attempts,
                model,
                exc,
                exc_info=True,
            )
            if not should_retry_completion_error(exc) or attempt == retry_attempts:
                break

    if last_exc is not None:
        raise last_exc
    raise RuntimeError("retry_transient_completion exhausted without executing")
