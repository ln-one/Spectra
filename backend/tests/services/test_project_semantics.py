from types import SimpleNamespace

from schemas.projects import ProjectReferenceMode, ProjectVisibility
from services.project_space_service.project_semantics import (
    allows_cross_owner_reference,
    is_project_referenceable,
    is_project_shared,
    normalize_project_reference_mode,
    normalize_project_visibility,
)


def test_normalize_project_visibility_defaults_private():
    assert normalize_project_visibility(None) is ProjectVisibility.PRIVATE


def test_normalize_project_reference_mode_defaults_follow():
    assert normalize_project_reference_mode(None) is ProjectReferenceMode.FOLLOW


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
