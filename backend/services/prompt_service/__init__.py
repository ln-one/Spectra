"""Prompt Service

Centralized prompt builders for courseware generation and chat workflows.
"""

import logging
from typing import Optional

from .chat import build_chat_response_prompt, contains_mechanical_option_pattern
from .constants import _RAG_CHUNK_MAX_CHARS, STYLE_REQUIREMENTS
from .courseware import build_courseware_prompt, build_modify_prompt
from .escaping import escape_prompt_text
from .intent import build_intent_prompt
from .rag import format_rag_context as _format_rag_context
from .render_rewrite import build_courseware_render_rewrite_prompt
from .semantics import (
    PROMPT_OUTPUT_MARKERS,
    PromptCitationStyle,
    PromptOutputBlock,
    build_conversation_history_section,
    build_rag_reference_section,
    build_session_scope_section,
    output_block_marker,
)
from .traceability import (
    PROMPT_BASELINE_ID,
    PROMPT_POLICY_VERSION,
    RETRIEVAL_MODE_DEFAULT_LIBRARY,
    RETRIEVAL_MODE_STRICT_SOURCES,
    build_prompt_traceability,
    resolve_retrieval_mode,
)

logger = logging.getLogger(__name__)


class PromptService:
    """Prompt template service."""

    def build_courseware_prompt(
        self,
        user_requirements: str,
        template_style: str = "default",
        rag_context: Optional[list[dict]] = None,
        outline_mode: bool = False,
        outline_slide_count: Optional[int] = None,
    ) -> str:
        return build_courseware_prompt(
            user_requirements=user_requirements,
            template_style=template_style,
            rag_context=rag_context,
            outline_mode=outline_mode,
            outline_slide_count=outline_slide_count,
        )

    def build_intent_prompt(self, user_message: str) -> str:
        return build_intent_prompt(user_message)

    def build_modify_prompt(
        self,
        current_content: str,
        instruction: str,
        target_slides: Optional[list[str]] = None,
        rag_context: Optional[list[dict]] = None,
        strict_source_mode: bool = False,
    ) -> str:
        return build_modify_prompt(
            current_content=current_content,
            instruction=instruction,
            target_slides=target_slides,
            rag_context=rag_context,
            strict_source_mode=strict_source_mode,
        )

    def build_chat_response_prompt(
        self,
        user_message: str,
        intent: str,
        session_id: Optional[str] = None,
        rag_context: Optional[list[dict]] = None,
        conversation_history: Optional[list[dict]] = None,
    ) -> str:
        return build_chat_response_prompt(
            user_message=user_message,
            intent=intent,
            session_id=session_id,
            rag_context=rag_context,
            conversation_history=conversation_history,
        )

    def build_courseware_render_rewrite_prompt(
        self,
        markdown_content: str,
        title: str,
        slide_count: int,
        outline_summary: Optional[str] = None,
    ) -> str:
        return build_courseware_render_rewrite_prompt(
            markdown_content=markdown_content,
            title=title,
            slide_count=slide_count,
            outline_summary=outline_summary,
        )


prompt_service = PromptService()

__all__ = [
    "PromptService",
    "STYLE_REQUIREMENTS",
    "_RAG_CHUNK_MAX_CHARS",
    "escape_prompt_text",
    "_format_rag_context",
    "build_chat_response_prompt",
    "build_courseware_prompt",
    "build_intent_prompt",
    "build_modify_prompt",
    "contains_mechanical_option_pattern",
    "PromptCitationStyle",
    "PromptOutputBlock",
    "PROMPT_OUTPUT_MARKERS",
    "build_rag_reference_section",
    "build_conversation_history_section",
    "build_session_scope_section",
    "output_block_marker",
    "RETRIEVAL_MODE_DEFAULT_LIBRARY",
    "RETRIEVAL_MODE_STRICT_SOURCES",
    "PROMPT_POLICY_VERSION",
    "PROMPT_BASELINE_ID",
    "resolve_retrieval_mode",
    "build_prompt_traceability",
    "prompt_service",
]
