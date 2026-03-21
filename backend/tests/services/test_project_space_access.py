from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from schemas.project_space import ProjectPermission
from services.project_space_service.access import check_project_permission
from utils.exceptions import ForbiddenException


@pytest.mark.asyncio
async def test_check_project_permission_rejects_disabled_member():
    service = SimpleNamespace(
        db=SimpleNamespace(
            get_project=AsyncMock(
                return_value=SimpleNamespace(id="p-001", userId="u-owner")
            ),
            get_project_member_by_user=AsyncMock(
                return_value=SimpleNamespace(
                    userId="u-member",
                    status="disabled",
                    permissions={"can_view": True, "can_collaborate": True},
                )
            ),
        )
    )

    with pytest.raises(ForbiddenException):
        await check_project_permission(
            service,
            project_id="p-001",
            user_id="u-member",
            permission=ProjectPermission.VIEW,
        )
