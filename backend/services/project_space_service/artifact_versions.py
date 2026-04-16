"""Version-anchor helpers for Spectra-side file orchestration."""

from __future__ import annotations

from typing import Optional

from utils.exceptions import ConflictException, ValidationException


async def resolve_based_on_version_id(
    *,
    service,
    project_id: str,
    based_on_version_id: Optional[str],
) -> Optional[str]:
    if based_on_version_id:
        version, _ = await service.get_project_version_with_context(
            project_id,
            based_on_version_id,
        )
        if not version or getattr(version, "projectId", None) != project_id:
            raise ValidationException(
                "based_on_version_id "
                f"{based_on_version_id} is invalid for project {project_id}"
            )
        return based_on_version_id

    current_version_id = await service.get_project_current_version_id(project_id)
    if not current_version_id:
        return None

    version, _ = await service.get_project_version_with_context(
        project_id, current_version_id
    )
    if not version or getattr(version, "projectId", None) != project_id:
        raise ConflictException(
            "Project current version anchor is invalid or no longer "
            "belongs to the project."
        )
    return current_version_id
