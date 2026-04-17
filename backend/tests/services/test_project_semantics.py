from types import SimpleNamespace

import pytest

from schemas.project_semantics import (
    allows_cross_owner_reference,
    is_project_referenceable,
    is_project_shared,
    normalize_project_reference_mode,
    normalize_project_referenceable,
    normalize_project_visibility,
    validate_project_sharing_rules,
)
from schemas.project_vocabulary import ProjectReferenceMode, ProjectVisibility


def test_normalize_project_visibility_defaults_private():
    assert normalize_project_visibility(None) is ProjectVisibility.PRIVATE


def test_normalize_project_reference_mode_defaults_follow():
    assert normalize_project_reference_mode(None) is ProjectReferenceMode.FOLLOW


def test_normalize_project_referenceable_defaults_false():
    assert normalize_project_referenceable(None) is False


def test_is_project_referenceable_uses_explicit_flag():
    assert is_project_referenceable(SimpleNamespace(isReferenceable=True)) is True
    assert is_project_referenceable(SimpleNamespace(isReferenceable=False)) is False


def test_is_project_shared_uses_visibility_vocabulary():
    assert is_project_shared(SimpleNamespace(visibility="shared")) is True
    assert is_project_shared(SimpleNamespace(visibility="private")) is False


def test_allows_cross_owner_reference_requires_shared_for_other_owner():
    source = SimpleNamespace(userId="u-source")
    private_target = SimpleNamespace(userId="u-target", visibility="private")
    shared_target = SimpleNamespace(userId="u-target", visibility="shared")

    assert allows_cross_owner_reference(source, private_target) is False
    assert allows_cross_owner_reference(source, shared_target) is True


def test_validate_project_sharing_rules_rejects_private_referenceable():
    with pytest.raises(ValueError, match="private 项目不能直接设置为可引用"):
        validate_project_sharing_rules(ProjectVisibility.PRIVATE, True)


def test_validate_project_sharing_rules_accepts_shared_referenceable():
    visibility, is_referenceable = validate_project_sharing_rules(
        ProjectVisibility.SHARED, True
    )
    assert visibility is ProjectVisibility.SHARED
    assert is_referenceable is True
