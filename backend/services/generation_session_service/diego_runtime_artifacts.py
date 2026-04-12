from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any, Optional

from services.artifact_generator import artifact_generator
from services.generation_session_service.outline_versions import (
    parse_outline_json,
)
from services.generation_session_service.run_lifecycle import update_session_run
from services.preview_helpers.content_generation import build_outline_preview_payload
from services.project_space_service.service import project_space_service

from .diego_runtime_helpers import normalize_rag_source_ids

_DIEGO_DEFAULT_VISIBILITY = "private"


async def _load_latest_outline_document(db, session_id: str) -> dict[str, Any] | None:
    record = await db.outlineversion.find_first(
        where={"sessionId": session_id},
        order={"version": "desc"},
    )
    if not record:
        return None
    parsed = parse_outline_json(getattr(record, "outlineData", None))
    if parsed is not None:
        parsed["version"] = getattr(record, "version", parsed.get("version", 1))
    return parsed


async def persist_diego_success_artifact(
    *,
    db,
    session,
    run,
    diego_run_id: str,
    diego_trace_id: Optional[str],
    options: dict[str, Any],
    pptx_bytes: bytes,
) -> tuple[str, str]:
    artifact_token = str(uuid.uuid4())
    storage_path = artifact_generator.get_storage_path(
        session.projectId,
        "pptx",
        artifact_token,
    )
    storage_file = Path(storage_path)
    storage_file.parent.mkdir(parents=True, exist_ok=True)
    storage_file.write_bytes(pptx_bytes)

    project = await db.project.find_unique(where={"id": session.projectId})
    outline_doc = await _load_latest_outline_document(db, session.id)
    preview_content = build_outline_preview_payload(
        getattr(project, "name", None) or "课件预览",
        outline_doc,
    )
    metadata: dict[str, Any] = {
        "mode": "create",
        "status": "completed",
        "output_type": "ppt",
        "title": str(getattr(run, "title", "课件生成") or "课件生成")[:120],
        "run_id": getattr(run, "id", None),
        "run_no": getattr(run, "runNo", None),
        "run_title": getattr(run, "title", None),
        "tool_type": getattr(run, "toolType", None),
        "is_current": True,
        "source": "diego",
        "diego_run_id": diego_run_id,
        "diego_trace_id": diego_trace_id,
        "rag_source_ids": normalize_rag_source_ids(options.get("rag_source_ids")),
        "template_config": (
            dict(options.get("template_config"))
            if isinstance(options.get("template_config"), dict)
            else None
        ),
    }
    if isinstance(preview_content, dict):
        metadata["preview_content"] = preview_content

    artifact = await project_space_service.create_artifact(
        project_id=session.projectId,
        artifact_type="pptx",
        visibility=_DIEGO_DEFAULT_VISIBILITY,
        user_id=session.userId,
        session_id=session.id,
        based_on_version_id=getattr(session, "baseVersionId", None),
        storage_path=storage_path,
        metadata=metadata,
    )

    await update_session_run(
        db=db,
        run_id=run.id,
        artifact_id=artifact.id,
        status="completed",
        step="completed",
    )
    download_url = (
        f"/api/v1/projects/{session.projectId}/artifacts/{artifact.id}/download"
    )
    return artifact.id, download_url
