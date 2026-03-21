from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.project_space_service.members import (
    create_project_member,
    update_project_member,
)
from utils.exceptions import ConflictException, ValidationException


@pytest.mark.asyncio
async def test_create_project_member_rejects_owner_role():
    service = SimpleNamespace(
        check_project_permission=AsyncMock(return_value=True),
        db=SimpleNamespace(
            get_project=AsyncMock(return_value=SimpleNamespace(userId="u-owner"))
        ),
    )

    with pytest.raises(ValidationException, match="owner role"):
        await create_project_member(
            service,
            project_id="p-001",
            user_id="u-manager",
            target_user_id="u-member",
            role="owner",
        )


@pytest.mark.asyncio
async def test_create_project_member_rejects_implicit_owner_membership():
    service = SimpleNamespace(
        check_project_permission=AsyncMock(return_value=True),
        db=SimpleNamespace(
            get_project=AsyncMock(return_value=SimpleNamespace(userId="u-owner"))
        ),
    )

    with pytest.raises(ValidationException, match="implicit"):
        await create_project_member(
            service,
            project_id="p-001",
            user_id="u-manager",
            target_user_id="u-owner",
            role="viewer",
        )


@pytest.mark.asyncio
async def test_create_project_member_rejects_disabled_duplicate():
    service = SimpleNamespace(
        check_project_permission=AsyncMock(return_value=True),
        db=SimpleNamespace(
            get_project=AsyncMock(return_value=SimpleNamespace(userId="u-owner")),
            get_project_member_by_user=AsyncMock(
                return_value=SimpleNamespace(id="m-001", status="disabled")
            ),
        ),
    )

    with pytest.raises(ConflictException, match="update the existing membership"):
        await create_project_member(
            service,
            project_id="p-001",
            user_id="u-manager",
            target_user_id="u-member",
            role="viewer",
        )

    service.db.get_project_member_by_user.assert_awaited_once_with(
        "p-001", "u-member", include_inactive=True
    )


@pytest.mark.asyncio
async def test_update_project_member_rejects_owner_membership_mutation():
    service = SimpleNamespace(
        check_project_permission=AsyncMock(return_value=True),
        db=SimpleNamespace(
            get_project=AsyncMock(return_value=SimpleNamespace(userId="u-owner")),
            get_project_member=AsyncMock(
                return_value=SimpleNamespace(
                    id="m-owner",
                    projectId="p-001",
                    userId="u-owner",
                    role="owner",
                )
            ),
        ),
    )

    with pytest.raises(ValidationException, match="project owner membership"):
        await update_project_member(
            service,
            project_id="p-001",
            member_id="m-owner",
            user_id="u-manager",
            status="disabled",
        )
