from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from .tool_content_builder_generation import generate_structured_artifact_content
from .tool_content_builder_payloads import normalize_demonstration_animation_payload

StudioCardArtifactBuilder = Callable[..., Awaitable[dict[str, Any]]]


async def _build_generic_artifact_content(
    *,
    card_id: str,
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
    source_artifact_id: str | None = None,
    rag_source_ids: list[str] | None = None,
) -> dict[str, Any]:
    del source_artifact_id, rag_source_ids
    return await generate_structured_artifact_content(
        card_id=card_id,
        config=config,
        rag_snippets=rag_snippets,
        source_hint=source_hint,
    )


async def _build_demonstration_animation_artifact_content(
    *,
    card_id: str,
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
    source_artifact_id: str | None = None,
    rag_source_ids: list[str] | None = None,
) -> dict[str, Any]:
    del card_id, rag_snippets, source_hint
    return await normalize_demonstration_animation_payload(
        {
            "kind": "animation_storyboard",
            "source_artifact_id": source_artifact_id,
            "rag_source_ids": list(rag_source_ids or []),
        },
        config,
    )


STUDIO_CARD_BUILDERS: dict[str, StudioCardArtifactBuilder] = {
    "demonstration_animations": _build_demonstration_animation_artifact_content,
}


def resolve_card_artifact_builder(card_id: str) -> StudioCardArtifactBuilder:
    return STUDIO_CARD_BUILDERS.get(card_id, _build_generic_artifact_content)
