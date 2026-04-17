from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from schemas.projects import ProjectCreate
from services.database import DatabaseService


@pytest.mark.asyncio
async def test_create_project_persists_validated_project_fields():
    service = DatabaseService()
    created_project = SimpleNamespace(
        id="p-new", visibility="shared", isReferenceable=True
    )
    create_mock = AsyncMock(return_value=created_project)
    service.db = SimpleNamespace(project=SimpleNamespace(create=create_mock))

    body = ProjectCreate(
        name="new project",
        description="desc",
        visibility="shared",
        is_referenceable=True,
        base_project_id="p-base",
        reference_mode="follow",
    )

    result = await service.create_project(body, user_id="u-1")

    assert result is created_project
    create_mock.assert_awaited_once_with(
        data={
            "name": "new project",
            "description": "desc",
            "userId": "u-1",
            "visibility": "shared",
            "isReferenceable": True,
        }
    )


@pytest.mark.asyncio
async def test_create_project_includes_grade_level_when_present():
    service = DatabaseService()
    create_mock = AsyncMock(return_value=SimpleNamespace(id="p-new"))
    service.db = SimpleNamespace(project=SimpleNamespace(create=create_mock))

    body = ProjectCreate(
        name="new project",
        description="desc",
        grade_level="高中",
    )

    await service.create_project(body, user_id="u-1")

    create_mock.assert_awaited_once_with(
        data={
            "name": "new project",
            "description": "desc",
            "userId": "u-1",
            "gradeLevel": "高中",
            "visibility": "private",
            "isReferenceable": False,
        }
    )
