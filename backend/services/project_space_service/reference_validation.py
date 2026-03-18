"""Reference validation helpers for Project Space service."""

from typing import Optional, Set

from utils.exceptions import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
    ValidationException,
)


async def check_dag_cycle(db, project_id: str, new_target_id: str) -> bool:
    """Check whether adding a project reference would create a DAG cycle."""
    visited: Set[str] = set()

    async def can_reach(current: str, target: str) -> bool:
        if current == target:
            return True
        if current in visited:
            return False
        visited.add(current)

        refs = await db.get_project_references(current)
        for ref in refs:
            if await can_reach(ref.targetProjectId, target):
                return True
        return False

    return await can_reach(new_target_id, project_id)


async def validate_reference_creation(
    db,
    project_id: str,
    target_project_id: str,
    relation_type: str,
    mode: str,
    pinned_version_id: Optional[str],
):
    """Validate project reference creation rules."""
    source_project = await db.get_project(project_id)
    if not source_project:
        raise NotFoundException(f"Project not found: {project_id}")

    target_project = await db.get_project(target_project_id)
    if not target_project:
        raise NotFoundException(f"Target project not found: {target_project_id}")

    if not getattr(target_project, "isReferenceable", True):
        raise ValidationException(f"Target not referenceable: {target_project_id}")

    target_visibility = getattr(target_project, "visibility", "private")
    source_owner_id = getattr(source_project, "userId", None)
    target_owner_id = getattr(target_project, "userId", None)
    if (
        target_visibility != "shared"
        and source_owner_id
        and target_owner_id
        and source_owner_id != target_owner_id
    ):
        raise ForbiddenException(
            "Target project is private across owners unless visibility is shared."
        )

    if relation_type == "base":
        existing_base = await db.get_base_reference(project_id)
        if existing_base:
            raise ConflictException("Project already has an active base reference.")

    if mode == "pinned" and not pinned_version_id:
        raise ValidationException("mode=pinned requires pinned_version_id")

    if pinned_version_id:
        version = await db.get_project_version(pinned_version_id)
        if not version or version.projectId != target_project_id:
            raise ValidationException(
                f"Invalid pinned_version_id for target project: {pinned_version_id}"
            )

    if await check_dag_cycle(db, project_id, target_project_id):
        raise ConflictException(
            f"Reference would create DAG cycle: {project_id} -> {target_project_id}"
        )
