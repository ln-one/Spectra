from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.diego_slide_scene import (
    get_diego_slide_asset_for_run,
    save_diego_slide_scene_for_run,
)
from utils.exceptions import APIException, ExternalServiceException


class _ConflictDiegoClient:
    async def save_slide_scene(self, *_args, **_kwargs):
        raise ExternalServiceException(
            message="scene_version 已过期",
            status_code=502,
            details={
                "status_code": 409,
                "body": {"detail": {"message": "scene_version 已过期"}},
            },
            retryable=False,
        )


class _SuccessDiegoClient:
    async def get_slide_asset(self, *_args, **_kwargs):
        return b"image-bytes"

    async def save_slide_scene(self, *_args, **_kwargs):
        return {
            "run_id": "diego-run-1",
            "slide_id": "diego-run-1-slide-0",
            "slide_index": 0,
            "slide_no": 1,
            "render_version": 2,
            "status": "ready",
            "scene": {
                "run_id": "diego-run-1",
                "slide_id": "diego-run-1-slide-0",
                "slide_index": 0,
                "slide_no": 1,
                "scene_version": "scene-v2",
                "nodes": [],
                "readonly": False,
                "readonly_reason": None,
            },
            "preview": {
                "preview_format": "svg",
                "page_index": 0,
                "slide_id": "diego-run-1-slide-0",
                "svg_data_url": "data:image/svg+xml;base64,updated",
            },
        }


@pytest.mark.anyio
async def test_get_diego_slide_asset_for_run_returns_asset_bytes(monkeypatch):
    run = SimpleNamespace(id="run-1")
    session = SimpleNamespace(id="sess-1", userId="user-1")

    monkeypatch.setattr(
        "services.generation_session_service.diego_slide_scene.build_diego_client",
        lambda: _SuccessDiegoClient(),
    )
    monkeypatch.setattr(
        "services.generation_session_service.diego_slide_scene.resolve_run_and_session",
        AsyncMock(return_value=(run, session)),
    )
    monkeypatch.setattr(
        (
            "services.generation_session_service.diego_slide_scene"
            ".resolve_diego_binding_for_run"
        ),
        AsyncMock(return_value={"diego_run_id": "diego-run-1"}),
    )

    result = await get_diego_slide_asset_for_run(
        db=SimpleNamespace(),
        run_id="run-1",
        slide_no=1,
        asset_path="imgs/hero.jpg",
        user_id="user-1",
    )

    assert result == b"image-bytes"


@pytest.mark.anyio
async def test_save_diego_slide_scene_syncs_preview_cache_and_render_version(
    monkeypatch,
):
    run = SimpleNamespace(id="run-1")
    session = SimpleNamespace(id="sess-1", userId="user-1")
    update = AsyncMock(return_value=SimpleNamespace(renderVersion=2))
    db = SimpleNamespace(generationsession=SimpleNamespace(update=update))
    save_preview = AsyncMock()

    monkeypatch.setattr(
        "services.generation_session_service.diego_slide_scene.build_diego_client",
        lambda: _SuccessDiegoClient(),
    )
    monkeypatch.setattr(
        "services.generation_session_service.diego_slide_scene.resolve_run_and_session",
        AsyncMock(return_value=(run, session)),
    )
    monkeypatch.setattr(
        (
            "services.generation_session_service.diego_slide_scene"
            ".resolve_diego_binding_for_run"
        ),
        AsyncMock(return_value={"diego_run_id": "diego-run-1"}),
    )
    monkeypatch.setattr(
        (
            "services.generation_session_service.diego_slide_scene"
            "._load_or_init_run_preview_payload"
        ),
        AsyncMock(return_value={"rendered_preview": {"format": "svg", "pages": []}}),
    )
    monkeypatch.setattr(
        "services.generation_session_service.diego_slide_scene.save_preview_content",
        save_preview,
    )

    result = await save_diego_slide_scene_for_run(
        db=db,
        run_id="run-1",
        slide_no=1,
        payload={"scene_version": "scene-v1", "operations": []},
        user_id="user-1",
    )

    assert result["render_version"] == 2
    save_preview.assert_awaited_once()
    saved_payload = save_preview.await_args.args[1]
    assert (
        saved_payload["rendered_preview"]["pages"][0]["svg_data_url"]
        == "data:image/svg+xml;base64,updated"
    )
    update.assert_awaited_once_with(
        where={"id": "sess-1"},
        data={"renderVersion": 2},
    )


@pytest.mark.anyio
async def test_save_diego_slide_scene_maps_upstream_409_to_conflict(monkeypatch):
    run = SimpleNamespace(id="run-1")
    session = SimpleNamespace(id="sess-1", userId="user-1")

    monkeypatch.setattr(
        "services.generation_session_service.diego_slide_scene.build_diego_client",
        lambda: _ConflictDiegoClient(),
    )
    monkeypatch.setattr(
        "services.generation_session_service.diego_slide_scene.resolve_run_and_session",
        AsyncMock(return_value=(run, session)),
    )
    monkeypatch.setattr(
        (
            "services.generation_session_service.diego_slide_scene"
            ".resolve_diego_binding_for_run"
        ),
        AsyncMock(return_value={"diego_run_id": "diego-run-1"}),
    )

    with pytest.raises(APIException) as exc_info:
        await save_diego_slide_scene_for_run(
            db=SimpleNamespace(),
            run_id="run-1",
            slide_no=1,
            payload={"scene_version": "old", "operations": []},
            user_id="user-1",
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.error_code.value == "RESOURCE_CONFLICT"
    assert exc_info.value.details["reason"] == "diego_scene_conflict"
    assert exc_info.value.details["upstream_status_code"] == 409
