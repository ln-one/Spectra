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
