from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from schemas.projects import ProjectCreate
from services.database import DatabaseService
from utils.exceptions import ValidationException


@pytest.mark.asyncio
async def test_create_project_with_base_reference_follow_success(monkeypatch):
    service = DatabaseService()
    project = SimpleNamespace(id="p-new")
    base_project = SimpleNamespace(id="p-base", currentVersionId="v-current")

    service.db = SimpleNamespace(
        project=SimpleNamespace(create=AsyncMock(return_value=project))
    )
    monkeypatch.setattr(service, "get_project", AsyncMock(return_value=base_project))
    create_reference = AsyncMock(return_value=SimpleNamespace(id="r-1"))
    monkeypatch.setattr(service, "create_project_reference", create_reference)
    delete_project = AsyncMock(return_value=None)
    monkeypatch.setattr(service, "delete_project", delete_project)

    body = ProjectCreate(
        name="new project",
        description="desc",
        base_project_id="p-base",
        reference_mode="follow",
        visibility="private",
        is_referenceable=False,
    )
    result = await service.create_project(body, user_id="u-1")

    assert result.id == "p-new"
    create_reference.assert_awaited_once_with(
        project_id="p-new",
        target_project_id="p-base",
        relation_type="base",
        mode="follow",
        pinned_version_id=None,
        priority=0,
        created_by="u-1",
    )
    delete_project.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_project_with_base_reference_pinned_requires_version(monkeypatch):
    service = DatabaseService()
    project = SimpleNamespace(id="p-new")
    base_project = SimpleNamespace(id="p-base", currentVersionId=None)

    service.db = SimpleNamespace(
        project=SimpleNamespace(create=AsyncMock(return_value=project))
    )
    monkeypatch.setattr(service, "get_project", AsyncMock(return_value=base_project))
    monkeypatch.setattr(
        service,
        "create_project_reference",
        AsyncMock(return_value=SimpleNamespace(id="r-1")),
    )
    delete_project = AsyncMock(return_value=None)
    monkeypatch.setattr(service, "delete_project", delete_project)

    body = ProjectCreate(
        name="new project",
        description="desc",
        base_project_id="p-base",
        reference_mode="pinned",
    )

    with pytest.raises(ValidationException):
        await service.create_project(body, user_id="u-1")

    delete_project.assert_awaited_once_with("p-new")
