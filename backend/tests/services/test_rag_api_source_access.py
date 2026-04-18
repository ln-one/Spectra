from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.rag_api_service import access, core
from utils.exceptions import ForbiddenException, NotFoundException


@pytest.mark.asyncio
async def test_resolve_and_validate_chunk_access_rejects_project_mismatch(monkeypatch):
    monkeypatch.setattr(
        access,
        "resolve_chunk_project_and_upload",
        AsyncMock(return_value=("proj-real", object())),
    )
    monkeypatch.setattr(access, "ensure_project_access", AsyncMock())

    with pytest.raises(ForbiddenException):
        await access.resolve_and_validate_chunk_access(
            chunk_id="chunk-1",
            project_id="proj-request",
            user_id="user-1",
        )


@pytest.mark.asyncio
async def test_resolve_and_validate_chunk_access_rejects_missing_chunk(monkeypatch):
    monkeypatch.setattr(
        access,
        "resolve_chunk_project_and_upload",
        AsyncMock(return_value=(None, None)),
    )
    monkeypatch.setattr(access, "ensure_project_access", AsyncMock())

    with pytest.raises(NotFoundException):
        await access.resolve_and_validate_chunk_access(
            chunk_id="chunk-1",
            project_id=None,
            user_id="user-1",
        )


@pytest.mark.asyncio
async def test_resolve_and_validate_chunk_access_allows_scope_fallback(monkeypatch):
    ensure_access = AsyncMock()
    monkeypatch.setattr(
        access,
        "resolve_chunk_project_and_upload",
        AsyncMock(return_value=(None, None)),
    )
    monkeypatch.setattr(access, "ensure_project_access", ensure_access)

    resolved_project_id, parsed = await access.resolve_and_validate_chunk_access(
        chunk_id="chunk-1",
        project_id="proj-request",
        user_id="user-1",
    )

    assert resolved_project_id == "proj-request"
    assert parsed is None
    ensure_access.assert_awaited_once_with("proj-request", "user-1")


@pytest.mark.asyncio
async def test_resolve_and_validate_chunk_access_checks_owner(monkeypatch):
    ensure_access = AsyncMock()
    monkeypatch.setattr(
        access,
        "resolve_chunk_project_and_upload",
        AsyncMock(return_value=("proj-real", object())),
    )
    monkeypatch.setattr(access, "ensure_project_access", ensure_access)

    resolved_project_id, _ = await access.resolve_and_validate_chunk_access(
        chunk_id="chunk-1",
        project_id="proj-real",
        user_id="user-1",
    )

    assert resolved_project_id == "proj-real"
    ensure_access.assert_awaited_once_with("proj-real", "user-1")


@pytest.mark.asyncio
async def test_get_source_image_response_passes_resolved_project(monkeypatch):
    fake_payload = SimpleNamespace(
        content=b"x",
        media_type="image/png",
        etag='"etag"',
        cache_control="private, max-age=60",
    )
    monkeypatch.setattr(
        core,
        "resolve_and_validate_chunk_access",
        AsyncMock(return_value=("proj-real", "parsed-record")),
    )
    load_payload = AsyncMock(return_value=fake_payload)
    monkeypatch.setattr(core, "load_source_image_payload", load_payload)

    result = await core.get_source_image_response(
        chunk_id="chunk-1",
        image_path="assets/figure.png",
        user_id="user-1",
        project_id="proj-real",
    )

    assert result is fake_payload
    load_payload.assert_awaited_once_with(
        chunk_id="chunk-1",
        image_path="assets/figure.png",
        project_id="proj-real",
        parsed="parsed-record",
    )


@pytest.mark.asyncio
async def test_get_source_image_response_rejects_scope_only_chunk(monkeypatch):
    monkeypatch.setattr(
        core,
        "resolve_and_validate_chunk_access",
        AsyncMock(return_value=("proj-real", None)),
    )
    load_payload = AsyncMock()
    monkeypatch.setattr(core, "load_source_image_payload", load_payload)

    with pytest.raises(NotFoundException):
        await core.get_source_image_response(
            chunk_id="chunk-1",
            image_path="assets/figure.png",
            user_id="user-1",
            project_id="proj-real",
        )

    load_payload.assert_not_awaited()
