from __future__ import annotations

import json
from typing import Any, Mapping

from schemas.project_space import PROJECT_PERMISSION_FIELDS, ProjectPermission


def normalize_project_permission(
    permission: ProjectPermission | str,
) -> ProjectPermission:
    return (
        permission
        if isinstance(permission, ProjectPermission)
        else ProjectPermission(permission)
    )


def normalize_project_permissions(value: Any) -> dict[str, bool]:
    if value is None:
        return {}
    if isinstance(value, str):
        try:
            value = json.loads(value) if value else {}
        except json.JSONDecodeError:
            return {}
    if not isinstance(value, Mapping):
        return {}
    return {
        field: bool(value.get(field, False))
        for field in PROJECT_PERMISSION_FIELDS
        if field in value
    }


def has_project_permission(
    permissions: Any, permission: ProjectPermission | str
) -> bool:
    normalized_permission = normalize_project_permission(permission)
    normalized_permissions = normalize_project_permissions(permissions)
    return bool(normalized_permissions.get(normalized_permission.value, False))
