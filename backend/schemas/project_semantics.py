from __future__ import annotations

from typing import Any

from schemas.projects import ProjectReferenceMode, ProjectVisibility


def normalize_project_visibility(
    value: ProjectVisibility | str | None,
) -> ProjectVisibility:
    if value is None:
        return ProjectVisibility.PRIVATE
    return value if isinstance(value, ProjectVisibility) else ProjectVisibility(value)


def normalize_project_reference_mode(
    value: ProjectReferenceMode | str | None,
) -> ProjectReferenceMode:
    if value is None:
        return ProjectReferenceMode.FOLLOW
    return (
        value
        if isinstance(value, ProjectReferenceMode)
        else ProjectReferenceMode(value)
    )


def is_project_referenceable(project: Any) -> bool:
    return bool(getattr(project, "isReferenceable", False))


def is_project_shared(project: Any) -> bool:
    return (
        normalize_project_visibility(getattr(project, "visibility", None))
        == ProjectVisibility.SHARED
    )


def get_project_owner_id(project: Any) -> str | None:
    owner_id = getattr(project, "userId", None)
    if owner_id is None:
        return None
    normalized = str(owner_id).strip()
    return normalized or None


def allows_cross_owner_reference(source_project: Any, target_project: Any) -> bool:
    source_owner_id = get_project_owner_id(source_project)
    target_owner_id = get_project_owner_id(target_project)
    if not source_owner_id or not target_owner_id or source_owner_id == target_owner_id:
        return True
    return is_project_shared(target_project)
