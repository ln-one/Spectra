from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.project_space_service.project_records import (
    get_project_current_version_id,
    get_project_version_with_context,
)
from utils.exceptions import ConflictException, NotFoundException


@pytest.mark.asyncio
async def test_get_project_current_version_id_rejects_cross_project_anchor():
    service = SimpleNamespace(
        db=SimpleNamespace(
            get_project=AsyncMock(
                return_value=SimpleNamespace(id="p-001", currentVersionId="v-001")
            ),
            get_project_version=AsyncMock(
                return_value=SimpleNamespace(id="v-001", projectId="p-other")
            ),
        )
    )

    with pytest.raises(ConflictException, match="current version anchor"):
        await get_project_current_version_id(service, "p-001")


@pytest.mark.asyncio
async def test_get_project_version_with_context_rejects_foreign_version():
    service = SimpleNamespace(
        db=SimpleNamespace(
            get_project=AsyncMock(
                return_value=SimpleNamespace(id="p-001", currentVersionId="v-current")
            ),
            get_project_version=AsyncMock(
                side_effect=[
                    SimpleNamespace(id="v-current", projectId="p-001"),
                    SimpleNamespace(id="v-foreign", projectId="p-other"),
                ]
            ),
        )
    )

    with pytest.raises(NotFoundException, match="not found in project"):
        await get_project_version_with_context(service, "p-001", "v-foreign")
