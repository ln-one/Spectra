"""Reference validation helpers for Project Space service."""

from typing import Optional, Set

from schemas.project_reference_semantics import (
    normalize_reference_mode,
    normalize_reference_relation_type,
)
from schemas.project_space import ReferenceMode, ReferenceRelationType
from utils.exceptions import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
    ValidationException,
)

from .project_semantics import allows_cross_owner_reference, is_project_referenceable


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
    try:
        relation_type = normalize_reference_relation_type(relation_type).value
    except ValueError as exc:
        raise ValidationException("relation_type 仅支持 base 或 auxiliary") from exc

    try:
        mode = normalize_reference_mode(mode).value
    except ValueError as exc:
        raise ValidationException("mode 仅支持 follow 或 pinned") from exc

    source_project = await db.get_project(project_id)
    if not source_project:
        raise NotFoundException(f"Project not found: {project_id}")

    target_project = await db.get_project(target_project_id)
    if not target_project:
        raise NotFoundException(f"Target project not found: {target_project_id}")

    if not is_project_referenceable(target_project):
        raise ValidationException(f"Target not referenceable: {target_project_id}")

    if not allows_cross_owner_reference(source_project, target_project):
        raise ForbiddenException(
            "Target project is private across owners unless visibility is shared."
        )

    if relation_type == ReferenceRelationType.BASE.value:
        existing_base = await db.get_base_reference(project_id)
        if existing_base:
            raise ConflictException("Project already has an active base reference.")

    if mode == ReferenceMode.PINNED.value and not pinned_version_id:
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
