from schemas.project_space import ProjectPermission
from services.project_space_service.permission_semantics import (
    has_project_permission,
    normalize_project_permission,
    normalize_project_permissions,
)


def test_normalize_project_permissions_filters_known_fields():
    payload = normalize_project_permissions(
        {
            "can_view": 1,
            "can_manage": False,
            "unknown": True,
        }
    )

    assert payload == {"can_view": True, "can_manage": False}


def test_normalize_project_permissions_supports_json_string():
    payload = normalize_project_permissions(
        '{"can_view": true, "can_collaborate": true}'
    )

    assert payload == {"can_view": True, "can_collaborate": True}


def test_has_project_permission_accepts_enum_or_string():
    permissions = {"can_view": True, "can_collaborate": True}

    assert has_project_permission(permissions, ProjectPermission.VIEW) is True
    assert has_project_permission(permissions, "can_collaborate") is True
    assert has_project_permission(permissions, ProjectPermission.MANAGE) is False


def test_normalize_project_permission_returns_enum():
    assert normalize_project_permission("can_manage") is ProjectPermission.MANAGE
