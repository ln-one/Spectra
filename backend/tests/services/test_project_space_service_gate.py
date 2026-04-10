from unittest.mock import AsyncMock

import pytest

from services.project_space_service.service import ProjectSpaceService
from utils.exceptions import ExternalServiceException


def test_project_space_service_db_exposes_runtime_db(monkeypatch):
    monkeypatch.delenv("OUROGRAPH_BASE_URL", raising=False)

    service = ProjectSpaceService()

    assert service.db is not None


@pytest.mark.asyncio
async def test_project_space_service_requires_remote_for_formal_calls(monkeypatch):
    monkeypatch.delenv("OUROGRAPH_BASE_URL", raising=False)

    service = ProjectSpaceService()

    with pytest.raises(ExternalServiceException):
        await service.get_project_state("p-1", "u-1")


@pytest.mark.asyncio
async def test_project_space_service_uses_remote_when_configured(monkeypatch):
    monkeypatch.setenv("OUROGRAPH_BASE_URL", "http://ourograph.test")

    service = ProjectSpaceService()
    mock = AsyncMock(return_value={"ok": True})
    monkeypatch.setattr(
        "services.project_space_service.service.ourograph_client.get_project_state",
        mock,
    )

    result = await service.get_project_state("p-1", "u-1")

    assert result == {"ok": True}
    mock.assert_awaited_once_with("p-1", "u-1")


@pytest.mark.asyncio
async def test_project_space_service_check_project_exists_uses_remote(monkeypatch):
    monkeypatch.setenv("OUROGRAPH_BASE_URL", "http://ourograph.test")

    service = ProjectSpaceService()
    mock = AsyncMock(return_value=True)
    monkeypatch.setattr(
        "services.project_space_service.service.ourograph_client.check_project_exists",
        mock,
    )

    result = await service.check_project_exists("p-1")

    assert result is True
    mock.assert_awaited_once_with(project_id="p-1")


@pytest.mark.asyncio
async def test_project_space_service_create_managed_project_uses_remote(monkeypatch):
    monkeypatch.setenv("OUROGRAPH_BASE_URL", "http://ourograph.test")

    service = ProjectSpaceService()
    payload = {"project": {"id": "p-1"}}
    mock = AsyncMock(return_value=payload)
    monkeypatch.setattr(
        "services.project_space_service.service.ourograph_client.create_managed_project",
        mock,
    )

    result = await service.create_managed_project(
        project_id="p-1",
        user_id="u-1",
        name="Project A",
        description="desc",
        visibility="private",
        is_referenceable=False,
    )

    assert result == payload
    mock.assert_awaited_once_with(
        project_id="p-1",
        user_id="u-1",
        name="Project A",
        description="desc",
        visibility="private",
        is_referenceable=False,
    )


@pytest.mark.asyncio
async def test_project_space_service_get_project_artifacts_passes_user_id(monkeypatch):
    monkeypatch.setenv("OUROGRAPH_BASE_URL", "http://ourograph.test")

    service = ProjectSpaceService()
    payload = [{"id": "a-1"}]
    mock = AsyncMock(return_value=payload)
    monkeypatch.setattr(
        "services.project_space_service.service.ourograph_client.get_project_artifacts",
        mock,
    )

    result = await service.get_project_artifacts(
        "p-1",
        user_id="u-1",
        session_id_filter="s-1",
    )

    assert result == payload
    mock.assert_awaited_once_with(
        "p-1",
        user_id="u-1",
        type_filter=None,
        visibility_filter=None,
        owner_user_id_filter=None,
        based_on_version_id_filter=None,
        session_id_filter="s-1",
    )
