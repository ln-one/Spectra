"""Prompt suggestion pool generation task workflow."""

import asyncio
import logging

from schemas.rag import PromptSuggestionSurface

from .common import run_async_entrypoint

logger = logging.getLogger(__name__)

SURFACE_PRIORITY = {
    PromptSuggestionSurface.STUDIO_WORD: 0,
    PromptSuggestionSurface.PPT_GENERATION_CONFIG: 1,
    PromptSuggestionSurface.STUDIO_MINDMAP: 2,
    PromptSuggestionSurface.STUDIO_QUIZ: 3,
    PromptSuggestionSurface.STUDIO_ANIMATION: 4,
    PromptSuggestionSurface.STUDIO_SIMULATION: 5,
    PromptSuggestionSurface.STUDIO_GAME: 6,
    PromptSuggestionSurface.STUDIO_SPEAKER_NOTES: 7,
}


def _coerce_surfaces(surfaces: list[str] | None) -> list[PromptSuggestionSurface]:
    result: list[PromptSuggestionSurface] = []
    for raw in surfaces or []:
        try:
            result.append(PromptSuggestionSurface(raw))
        except ValueError:
            logger.warning("prompt_suggestion_pool_unknown_surface: %s", raw)
    return sorted(result, key=lambda surface: SURFACE_PRIORITY.get(surface, 99))


def run_prompt_suggestion_pool_task(
    project_id: str,
    surfaces: list[str],
    source_fingerprint: str,
):
    """Sync wrapper for RQ workers to generate prompt suggestion pools."""
    run_async_entrypoint(
        lambda: execute_prompt_suggestion_pool_task(
            project_id=project_id,
            surfaces=surfaces,
            source_fingerprint=source_fingerprint,
        )
    )


async def execute_prompt_suggestion_pool_task(
    project_id: str,
    surfaces: list[str],
    source_fingerprint: str,
):
    from services.database import DatabaseService
    from services.prompt_suggestion_pool import generate_prompt_suggestion_pool

    db = DatabaseService()
    db_connected = False
    try:
        await asyncio.wait_for(db.connect(), timeout=10)
        db_connected = True
        for surface in _coerce_surfaces(surfaces):
            await generate_prompt_suggestion_pool(
                project_id=project_id,
                surface=surface,
                source_fingerprint=source_fingerprint,
                db=db,
            )
    finally:
        if db_connected:
            try:
                await asyncio.wait_for(db.disconnect(), timeout=5)
            except Exception as exc:
                logger.debug(
                    "prompt_suggestion_pool_disconnect_failed: project_id=%s error=%s",
                    project_id,
                    exc,
                )
