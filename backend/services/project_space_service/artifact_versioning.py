"""Version-anchor helpers for artifact creation semantics."""

from typing import Optional

from utils.exceptions import ConflictException, ValidationException


async def resolve_based_on_version_id(
    *,
    db,
    project_id: str,
    based_on_version_id: Optional[str],
) -> Optional[str]:
    if based_on_version_id:
        version = await db.get_project_version(based_on_version_id)
        if not version or version.projectId != project_id:
            raise ValidationException(
                "based_on_version_id "
                f"{based_on_version_id} is invalid for project {project_id}"
            )
        return based_on_version_id

    project = await db.get_project(project_id)
    current_version_id = getattr(project, "currentVersionId", None) if project else None
    if not current_version_id:
        return None

    current_version = await db.get_project_version(current_version_id)
    if not current_version or current_version.projectId != project_id:
        raise ConflictException(
            "Project current version anchor is invalid or no longer "
            "belongs to the project."
        )
    return current_version_id
