from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.ourograph_client import OurographClient
from utils.exceptions import ValidationException


@pytest.mark.asyncio
async def test_ourograph_client_get_project_state_uses_transport(monkeypatch):
    client = OurographClient()
    request_mock = AsyncMock(return_value={"state": {"project_id": "p-1"}})
    monkeypatch.setattr(
        "services.ourograph_client_support.queries.request_json",
        request_mock,
    )

    result = await client.get_project_state("p-1", "u-1")

    assert result == {"state": {"project_id": "p-1"}}
    request_mock.assert_awaited_once_with(
        "GET",
        "/projects/p-1/state",
        query={"user_id": "u-1"},
    )


@pytest.mark.asyncio
async def test_ourograph_client_create_project_reference_returns_namespace(monkeypatch):
    client = OurographClient()
    request_mock = AsyncMock(
        return_value={"reference": {"id": "ref-1", "mode": "follow"}}
    )
    monkeypatch.setattr(
        "services.ourograph_client_support.commands.request_json",
        request_mock,
    )

    result = await client.create_project_reference(
        project_id="p-1",
        user_id="u-1",
        target_project_id="p-2",
        relation_type="reference",
        mode="follow",
    )

    assert isinstance(result, SimpleNamespace)
    assert result.id == "ref-1"
    assert result.mode == "follow"


def test_ourograph_transport_maps_validation_error():
    from services.ourograph_client_support.transport import _raise_service_error

    with pytest.raises(ValidationException):
        _raise_service_error(400, {"message": "bad input"})
