from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.project_space_service.reference_validation import (
    validate_reference_activation,
    validate_reference_creation,
)
from utils.exceptions import ConflictException, ValidationException


@pytest.mark.asyncio
async def test_validate_reference_creation_rejects_invalid_relation_type():
    db = SimpleNamespace()

    with pytest.raises(ValidationException, match="relation_type"):
        await validate_reference_creation(
            db=db,
            project_id="p-001",
            target_project_id="p-002",
            relation_type="mirror",
            mode="follow",
            pinned_version_id=None,
        )


@pytest.mark.asyncio
async def test_validate_reference_creation_rejects_invalid_mode():
    db = SimpleNamespace()

    with pytest.raises(ValidationException, match="mode"):
        await validate_reference_creation(
            db=db,
            project_id="p-001",
            target_project_id="p-002",
            relation_type="auxiliary",
            mode="snapshot",
            pinned_version_id=None,
        )


@pytest.mark.asyncio
async def test_update_project_reference_follow_clears_stale_pinned_version():
    from services.project_space_service.references import update_project_reference

    db = SimpleNamespace(
        get_project_reference=AsyncMock(
            return_value=SimpleNamespace(
                id="r-001",
                projectId="p-001",
                targetProjectId="p-target-001",
                relationType="auxiliary",
                mode="follow",
                pinnedVersionId=None,
                status="active",
            )
        ),
        update_project_reference=AsyncMock(return_value=SimpleNamespace(id="r-001")),
    )
    service = SimpleNamespace(
        db=db,
        check_project_permission=AsyncMock(return_value=True),
        validate_reference_activation=AsyncMock(return_value=None),
    )

    await update_project_reference(
        service,
        project_id="p-001",
        reference_id="r-001",
        user_id="u-001",
        mode="follow",
        pinned_version_id=None,
        priority=3,
        status="active",
    )

    db.update_project_reference.assert_awaited_once_with(
        reference_id="r-001",
        mode="follow",
        pinned_version_id=None,
        priority=3,
        status="active",
    )


@pytest.mark.asyncio
async def test_update_project_reference_reactivating_base_reference_revalidates_constraints():
    from services.project_space_service.references import update_project_reference

    db = SimpleNamespace(
        get_project_reference=AsyncMock(
            return_value=SimpleNamespace(
                id="r-001",
                projectId="p-001",
                targetProjectId="p-target-001",
                relationType="base",
                mode="follow",
                pinnedVersionId=None,
                status="disabled",
            )
        ),
        update_project_reference=AsyncMock(return_value=SimpleNamespace(id="r-001")),
    )
    service = SimpleNamespace(
        db=db,
        check_project_permission=AsyncMock(return_value=True),
        validate_reference_activation=AsyncMock(return_value=None),
    )

    await update_project_reference(
        service,
        project_id="p-001",
        reference_id="r-001",
        user_id="u-001",
        status="active",
    )

    service.validate_reference_activation.assert_awaited_once_with(
        project_id="p-001",
        reference_id="r-001",
        target_project_id="p-target-001",
        relation_type="base",
        mode="follow",
        pinned_version_id=None,
    )


@pytest.mark.asyncio
async def test_validate_reference_creation_rejects_cross_owner_private_target():
    db = SimpleNamespace(
        get_project=AsyncMock(
            side_effect=[
                SimpleNamespace(id="p-001", userId="u-001"),
                SimpleNamespace(
                    id="p-002",
                    userId="u-002",
                    visibility="private",
                    isReferenceable=True,
                ),
            ]
        ),
        get_base_reference=AsyncMock(return_value=None),
        get_project_version=AsyncMock(return_value=None),
        get_project_references=AsyncMock(return_value=[]),
    )

    from utils.exceptions import ForbiddenException

    with pytest.raises(ForbiddenException, match="private across owners"):
        await validate_reference_creation(
            db=db,
            project_id="p-001",
            target_project_id="p-002",
            relation_type="auxiliary",
            mode="follow",
            pinned_version_id=None,
        )


@pytest.mark.asyncio
async def test_validate_reference_creation_accepts_cross_owner_shared_target():
    db = SimpleNamespace(
        get_project=AsyncMock(
            side_effect=[
                SimpleNamespace(id="p-001", userId="u-001"),
                SimpleNamespace(
                    id="p-002",
                    userId="u-002",
                    visibility="shared",
                    isReferenceable=True,
                ),
            ]
        ),
        get_base_reference=AsyncMock(return_value=None),
        get_project_version=AsyncMock(return_value=None),
        get_project_references=AsyncMock(return_value=[]),
    )

    await validate_reference_creation(
        db=db,
        project_id="p-001",
        target_project_id="p-002",
        relation_type="auxiliary",
        mode="follow",
        pinned_version_id=None,
    )


def test_resolve_reference_pin_state_follow_clears_pin():
    from schemas.project_reference_semantics import resolve_reference_pin_state
    from schemas.project_space import ReferenceMode

    mode, pinned_version_id = resolve_reference_pin_state(
        ReferenceMode.FOLLOW, "v-stale"
    )

    assert mode is ReferenceMode.FOLLOW
    assert pinned_version_id is None


def test_normalize_reference_status_accepts_enum_and_string():
    from schemas.project_reference_semantics import normalize_reference_status
    from schemas.project_space import ReferenceStatus

    assert normalize_reference_status("active") is ReferenceStatus.ACTIVE
    assert (
        normalize_reference_status(ReferenceStatus.DISABLED) is ReferenceStatus.DISABLED
    )


@pytest.mark.asyncio
async def test_delete_project_reference_blocks_when_active_session_depends_on_current_version():
    from services.project_space_service.references import delete_project_reference

    service = SimpleNamespace(
        check_project_permission=AsyncMock(),
        db=SimpleNamespace(
            get_project_reference=AsyncMock(
                return_value=SimpleNamespace(
                    id="r-001",
                    projectId="p-001",
                    relationType="base",
                    status="active",
                )
            ),
            get_project=AsyncMock(
                return_value=SimpleNamespace(id="p-001", currentVersionId="v-001")
            ),
            get_candidate_changes=AsyncMock(return_value=[]),
            delete_project_reference=AsyncMock(),
            db=SimpleNamespace(
                generationsession=SimpleNamespace(
                    find_many=AsyncMock(
                        return_value=[
                            SimpleNamespace(id="s-001", state="DRAFTING_OUTLINE")
                        ]
                    )
                )
            ),
        ),
    )

    with pytest.raises(ConflictException):
        await delete_project_reference(service, "p-001", "r-001", "u-001")

    service.db.delete_project_reference.assert_not_awaited()


@pytest.mark.asyncio
async def test_delete_project_reference_blocks_when_pending_change_depends_on_current_version():
    from services.project_space_service.references import delete_project_reference

    service = SimpleNamespace(
        check_project_permission=AsyncMock(),
        db=SimpleNamespace(
            get_project_reference=AsyncMock(
                return_value=SimpleNamespace(
                    id="r-001",
                    projectId="p-001",
                    relationType="base",
                    status="active",
                )
            ),
            get_project=AsyncMock(
                return_value=SimpleNamespace(id="p-001", currentVersionId="v-001")
            ),
            get_candidate_changes=AsyncMock(
                return_value=[SimpleNamespace(id="c-001", baseVersionId="v-001")]
            ),
            delete_project_reference=AsyncMock(),
            db=SimpleNamespace(
                generationsession=SimpleNamespace(find_many=AsyncMock(return_value=[]))
            ),
        ),
    )

    with pytest.raises(ConflictException):
        await delete_project_reference(service, "p-001", "r-001", "u-001")

    service.db.delete_project_reference.assert_not_awaited()


@pytest.mark.asyncio
async def test_validate_reference_activation_rejects_second_active_base():
    db = SimpleNamespace(
        get_project=AsyncMock(
            side_effect=[
                SimpleNamespace(id="p-001", userId="u-001"),
                SimpleNamespace(
                    id="p-002",
                    userId="u-001",
                    visibility="private",
                    isReferenceable=True,
                ),
            ]
        ),
        get_base_reference=AsyncMock(
            return_value=SimpleNamespace(id="r-other", projectId="p-001")
        ),
        get_project_version=AsyncMock(return_value=None),
        get_project_references=AsyncMock(return_value=[]),
    )

    with pytest.raises(ConflictException, match="active base reference"):
        await validate_reference_activation(
            db,
            project_id="p-001",
            reference_id="r-001",
            target_project_id="p-002",
            relation_type="base",
            mode="follow",
            pinned_version_id=None,
        )
