"""Runtime helpers for project-space reference routes."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)


def _collect_target_project_ids(references) -> list[str]:
    return list(
        {
            ref.targetProjectId
            for ref in references
            if getattr(ref, "targetProjectId", None)
        }
    )


async def resolve_target_project_runtime_maps(
    *, db_service: Any, references
) -> tuple[dict[str, str | None], dict[str, str]]:
    target_project_ids = _collect_target_project_ids(references)
    if not target_project_ids:
        return {}, {}

    prisma = getattr(db_service, "db", None)
    project_model = getattr(prisma, "project", None)
    if project_model is not None and hasattr(project_model, "find_many"):
        try:
            rows = await project_model.find_many(
                where={"id": {"in": target_project_ids}},
                select={"id": True, "currentVersionId": True, "name": True},
            )
            version_map: dict[str, str | None] = {}
            name_map: dict[str, str] = {}
            for row in rows:
                row_id = (
                    row.get("id") if isinstance(row, dict) else getattr(row, "id", None)
                )
                if not row_id:
                    continue
                version_map[row_id] = (
                    row.get("currentVersionId")
                    if isinstance(row, dict)
                    else getattr(row, "currentVersionId", None)
                )
                name_value = (
                    row.get("name")
                    if isinstance(row, dict)
                    else getattr(row, "name", None)
                )
                name = str(name_value or "").strip()
                if name:
                    name_map[row_id] = name
            return (
                {
                    project_id: version_map.get(project_id)
                    for project_id in target_project_ids
                },
                name_map,
            )
        except Exception as exc:  # pragma: no cover - defensive fallback path
            logger.warning(
                "target runtime batch lookup failed; "
                "fallback to per-project lookup: %s",
                exc,
            )

    projects = await asyncio.gather(
        *(
            db_service.get_project(target_project_id)
            for target_project_id in target_project_ids
        ),
        return_exceptions=True,
    )
    version_map: dict[str, str | None] = {}
    name_map: dict[str, str] = {}
    for target_project_id, project in zip(target_project_ids, projects):
        if isinstance(project, Exception) or project is None:
            version_map[target_project_id] = None
            continue
        version_map[target_project_id] = getattr(project, "currentVersionId", None)
        name = str(getattr(project, "name", "") or "").strip()
        if name:
            name_map[target_project_id] = name
    return version_map, name_map


async def resolve_target_version_map(
    *, db_service: Any, references
) -> dict[str, str | None]:
    version_map, _ = await resolve_target_project_runtime_maps(
        db_service=db_service,
        references=references,
    )
    return version_map
