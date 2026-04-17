"""Artifact persistence helpers for generation outputs."""

from __future__ import annotations

import asyncio
import logging

from services.generation_session_service.session_history import update_session_run

from .runtime_context import build_run_context_payload, read_field
from .runtime_titles import resolve_ppt_artifact_title

logger = logging.getLogger(__name__)


def build_project_space_download_url(
    *,
    project_id: str,
    artifact_id: str,
) -> str:
    return f"/api/v1/projects/{project_id}/artifacts/{artifact_id}/download"


async def persist_generation_artifacts(
    db_service,
    context,
    artifact_paths: dict[str, str],
    courseware_content=None,
) -> dict[str, str]:
    if not context.session_id or not artifact_paths:
        return {}

    try:
        session = await db_service.db.generationsession.find_unique(
            where={"id": context.session_id}
        )
    except Exception as exc:
        logger.warning(
            "skip_persist_generation_artifacts session lookup failed: %s",
            exc,
        )
        return {}

    if not session:
        return {}

    user_id = read_field(session, "userId")
    base_version_id = read_field(session, "baseVersionId")
    project_id = read_field(session, "projectId") or context.project_id
    output_urls: dict[str, str] = {}
    persistence_errors: dict[str, str] = {}
    run_payload = build_run_context_payload(context)
    ppt_title = await resolve_ppt_artifact_title(
        db_service=db_service,
        context=context,
        project_id=project_id,
        courseware_content=courseware_content,
    )

    async def _persist_one(
        artifact_type: str,
        storage_path: str,
    ) -> tuple[str, str] | None:
        metadata_title = (
            ppt_title
            if artifact_type == "pptx"
            else (
                f"{ppt_title}教案"
                if artifact_type == "docx"
                else f"{artifact_type.upper()} · {context.task_id[:8]}"
            )
        )
        try:
            from services.project_space_service.service import project_space_service

            artifact = await project_space_service.create_artifact(
                project_id=project_id,
                artifact_type=artifact_type,
                visibility="private",
                user_id=user_id,
                session_id=context.session_id,
                based_on_version_id=base_version_id,
                storage_path=storage_path,
                metadata={
                    "mode": "create",
                    "status": "completed",
                    "output_type": "ppt" if artifact_type == "pptx" else "word",
                    "title": metadata_title[:120],
                    "task_id": context.task_id,
                    "is_current": True,
                    **run_payload,
                },
            )
            if run_payload.get("run_id"):
                await update_session_run(
                    db=db_service.db,
                    run_id=run_payload["run_id"],
                    artifact_id=artifact.id,
                )
            return artifact_type, build_project_space_download_url(
                project_id=project_id,
                artifact_id=artifact.id,
            )
        except Exception as exc:
            persistence_errors[artifact_type] = str(exc)
            logger.warning(
                "persist_generation_artifact_failed task_id=%s session_id=%s "
                "artifact_type=%s error=%s",
                context.task_id,
                context.session_id,
                artifact_type,
                exc,
            )
            return None

    results = await asyncio.gather(
        *(
            _persist_one(artifact_type, storage_path)
            for artifact_type, storage_path in artifact_paths.items()
        )
    )
    for item in results:
        if not item:
            continue
        artifact_type, url = item
        output_urls[artifact_type] = url
    if persistence_errors:
        detail = "; ".join(
            f"{artifact_type}: {message}"
            for artifact_type, message in sorted(persistence_errors.items())
        )
        raise RuntimeError(f"Failed to persist generated artifacts: {detail}")
    return output_urls
