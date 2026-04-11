from __future__ import annotations

import json
import logging
from typing import Any

from services.generation_session_service.run_constants import (
    RUN_TITLE_SOURCE_AUTO,
    RUN_TITLE_SOURCE_MANUAL,
)

logger = logging.getLogger(__name__)


def _parse_artifact_metadata(raw_metadata: Any) -> dict:
    if isinstance(raw_metadata, dict):
        return dict(raw_metadata)
    if isinstance(raw_metadata, str):
        try:
            parsed = json.loads(raw_metadata)
        except (TypeError, json.JSONDecodeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


async def sync_run_title_to_artifact_metadata(*, db, run: Any | None) -> None:
    if run is None:
        return
    artifact_id = getattr(run, "artifactId", None)
    run_title = str(getattr(run, "title", "") or "").strip()
    if not artifact_id or not run_title:
        return
    artifact_model = getattr(db, "artifact", None)
    if artifact_model is None:
        return
    if not hasattr(artifact_model, "find_unique") or not hasattr(
        artifact_model, "update"
    ):
        return

    try:
        artifact = await artifact_model.find_unique(where={"id": artifact_id})
        if not artifact:
            return
        metadata = _parse_artifact_metadata(getattr(artifact, "metadata", None))
        title_source = str(getattr(run, "titleSource", "") or "").strip()
        metadata["run_title"] = run_title
        if title_source:
            metadata["run_title_source"] = title_source
        if title_source in {RUN_TITLE_SOURCE_AUTO, RUN_TITLE_SOURCE_MANUAL}:
            metadata["title"] = run_title
        await artifact_model.update(
            where={"id": artifact_id},
            data={"metadata": json.dumps(metadata, ensure_ascii=False)},
        )
    except Exception as exc:
        logger.warning(
            "Sync run title to artifact metadata failed: run=%s artifact=%s error=%s",
            getattr(run, "id", None),
            artifact_id,
            exc,
        )
