from schemas.project_space import ProjectPermission
from services.project_space_service.permission_semantics import (
    default_project_permissions_for_role,
    has_project_permission,
    normalize_project_member_role,
    normalize_project_member_status,
    normalize_project_permission,
    normalize_project_permissions,
    resolve_project_member_permissions,
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


def test_default_project_permissions_for_editor_role():
    payload = default_project_permissions_for_role("editor")

    assert payload == {
        "can_view": True,
        "can_reference": True,
        "can_collaborate": True,
        "can_manage": False,
    }


def test_resolve_project_member_permissions_overrides_role_defaults():
    payload = resolve_project_member_permissions(
        "viewer",
        {"can_reference": True},
    )

    assert payload == {
        "can_view": True,
        "can_reference": True,
        "can_collaborate": False,
        "can_manage": False,
    }


def test_member_role_and_status_normalizers_return_enums():
    assert normalize_project_member_role("owner").value == "owner"
    assert normalize_project_member_status("disabled").value == "disabled"
