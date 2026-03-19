from __future__ import annotations

import json
from typing import Any, Mapping

from schemas.project_space import (
    PROJECT_PERMISSION_FIELDS,
    ProjectMemberRole,
    ProjectMemberStatus,
    ProjectPermission,
)

PROJECT_ROLE_DEFAULT_PERMISSIONS: dict[ProjectMemberRole, dict[str, bool]] = {
    ProjectMemberRole.OWNER: {
        ProjectPermission.VIEW.value: True,
        ProjectPermission.REFERENCE.value: True,
        ProjectPermission.COLLABORATE.value: True,
        ProjectPermission.MANAGE.value: True,
    },
    ProjectMemberRole.EDITOR: {
        ProjectPermission.VIEW.value: True,
        ProjectPermission.REFERENCE.value: True,
        ProjectPermission.COLLABORATE.value: True,
        ProjectPermission.MANAGE.value: False,
    },
    ProjectMemberRole.VIEWER: {
        ProjectPermission.VIEW.value: True,
        ProjectPermission.REFERENCE.value: False,
        ProjectPermission.COLLABORATE.value: False,
        ProjectPermission.MANAGE.value: False,
    },
}


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


def normalize_project_member_role(role: ProjectMemberRole | str) -> ProjectMemberRole:
    return role if isinstance(role, ProjectMemberRole) else ProjectMemberRole(role)


def normalize_project_member_status(
    status: ProjectMemberStatus | str,
) -> ProjectMemberStatus:
    return (
        status
        if isinstance(status, ProjectMemberStatus)
        else ProjectMemberStatus(status)
    )


def default_project_permissions_for_role(
    role: ProjectMemberRole | str,
) -> dict[str, bool]:
    normalized_role = normalize_project_member_role(role)
    return dict(PROJECT_ROLE_DEFAULT_PERMISSIONS[normalized_role])


def resolve_project_member_permissions(
    role: ProjectMemberRole | str,
    permissions: Any,
) -> dict[str, bool]:
    resolved = default_project_permissions_for_role(role)
    resolved.update(normalize_project_permissions(permissions))
    return resolved
