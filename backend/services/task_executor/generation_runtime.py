"""Helpers for generation task runtime orchestration."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from schemas.generation import requires_pptx_output

from .ppt_image_insertion import inject_rag_images_into_courseware_content
from .preview_runtime import cache_preview_content, persist_preview_payload
from .requirements import build_user_requirements, load_session_outline
from .runtime_helpers import (
    build_project_space_download_url as _build_project_space_download_url,
)
from .runtime_helpers import (
    finalize_generation_success,
    persist_generation_artifacts,
    render_generation_outputs,
)

logger = logging.getLogger(__name__)

__all__ = [
    "GenerationExecutionContext",
    "build_generation_inputs",
    "cache_preview_content",
    "persist_preview_payload",
    "render_generation_outputs",
    "persist_generation_artifacts",
    "finalize_generation_success",
    "_build_project_space_download_url",
]


@dataclass
class GenerationExecutionContext:
    task_id: str
    project_id: str
    task_type: str
    template_config: Optional[dict]
    start_time: float = field(default_factory=time.time)
    session_id: Optional[str] = None
    run_id: Optional[str] = None
    run_no: Optional[int] = None
    run_title: Optional[str] = None
    tool_type: Optional[str] = None
    outline_version: Optional[int] = None
    retrieval_mode: Optional[str] = None
    policy_version: Optional[str] = None
    baseline_id: Optional[str] = None


async def build_generation_inputs(db_service, context: GenerationExecutionContext):
    from services.ai import ai_service

    user_requirements, outline_payload = await asyncio.gather(
        build_user_requirements(
            db_service,
            context.project_id,
            session_id=context.session_id,
            rag_source_ids=(
                context.template_config.get("rag_source_ids")
                if context.template_config
                else None
            ),
        ),
        load_session_outline(
            db_service,
            session_id=context.session_id,
            outline_version=context.outline_version,
        ),
    )
    outline_document, outline_version = outline_payload

    courseware_content = await ai_service.generate_courseware_content(
        project_id=context.project_id,
        user_requirements=user_requirements,
        template_style=(
            context.template_config.get("style", "default")
            if context.template_config
            else "default"
        ),
        outline_document=outline_document,
        outline_version=outline_version,
        session_id=context.session_id,
        rag_source_ids=(
            context.template_config.get("rag_source_ids")
            if context.template_config
            else None
        ),
    )
    if requires_pptx_output(context.task_type):
        image_metadata = await inject_rag_images_into_courseware_content(
            db_service=db_service,
            project_id=context.project_id,
            query=user_requirements,
            session_id=context.session_id,
            rag_source_ids=(
                context.template_config.get("rag_source_ids")
                if context.template_config
                else None
            ),
            courseware_content=courseware_content,
        )
        if image_metadata:
            logger.info(
                "Image insertion completed: mode=%s, count=%d",
                image_metadata.get("retrieval_mode"),
                image_metadata.get("image_count", 0)
            )
            setattr(courseware_content, "_image_metadata", image_metadata)
    return courseware_content
