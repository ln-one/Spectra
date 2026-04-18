from pathlib import Path
from types import SimpleNamespace

import pytest

from services.artifact_generator.media import ArtifactMediaMixin
from services.generation_session_service.card_execution_preview import (
    build_studio_card_execution_preview,
)
from services.generation_session_service.card_execution_runtime_helpers import (
    load_artifact_content,
)
from services.project_space_service.artifact_content import build_artifact_metadata


class _MediaGenerator(ArtifactMediaMixin):
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir

    def get_storage_path(self, project_id: str, artifact_type: str, artifact_id: str):
        target_dir = self.base_dir / project_id / artifact_type
        target_dir.mkdir(parents=True, exist_ok=True)
        return str(target_dir / f"{artifact_id}.{artifact_type}")


def test_animation_preview_switches_to_mp4_for_cloud_video_mode():
    preview = build_studio_card_execution_preview(
        card_id="demonstration_animations",
        project_id="p-001",
        config={
            "topic": "植物生长全过程",
            "motion_brief": "突出种子发芽到开花结果的镜头变化",
            "duration_seconds": 10,
            "render_mode": "cloud_video_wan",
        },
    )

    assert preview is not None
    payload = preview.initial_request.payload
    assert payload["type"] == "mp4"
    assert payload["content"]["format"] == "mp4"
    assert payload["content"]["render_mode"] == "cloud_video_wan"
    assert payload["content"]["cloud_video_provider"] == "aliyun_wan"
    assert payload["content"]["cloud_video_model"] == "wan2.7-i2v"
    assert preview.spec_preview["artifact_type"] == "mp4"
    assert preview.render_mode == "cloud_video_wan"
    assert preview.artifact_type == "mp4"
    assert preview.placement_supported is False
    assert preview.runtime_preview_mode == "local_preview_only"
    assert preview.cloud_render_mode == "async_media_export"
    assert preview.protocol_status == "ready_to_execute"
    assert preview.refine_request.refine_mode.value == "structured_refine"


def test_animation_preview_defaults_to_cloud_video_wan():
    preview = build_studio_card_execution_preview(
        card_id="demonstration_animations",
        project_id="p-001",
        config={
            "topic": "植物生长全过程",
            "motion_brief": "突出种子发芽到开花结果的镜头变化",
            "duration_seconds": 10,
        },
    )

    payload = preview.initial_request.payload
    assert payload["type"] == "mp4"
    assert payload["content"]["format"] == "mp4"
    assert payload["content"]["render_mode"] == "cloud_video_wan"
    assert payload["content"]["cloud_video_provider"] == "aliyun_wan"
    assert payload["content"]["cloud_video_model"] == "wan2.7-i2v"
    assert preview.source_request is not None
    assert preview.placement_request is not None
    assert preview.spec_preview["placement_supported"] is False


def test_animation_preview_marks_gif_as_placement_ready():
    preview = build_studio_card_execution_preview(
        card_id="demonstration_animations",
        project_id="p-001",
        config={
            "topic": "植物生长全过程",
            "motion_brief": "突出种子发芽到开花结果的镜头变化",
            "duration_seconds": 10,
            "animation_format": "gif",
            "render_mode": "gif",
        },
    )

    payload = preview.initial_request.payload
    assert payload["type"] == "gif"
    assert payload["content"]["format"] == "gif"
    assert preview.artifact_type == "gif"
    assert preview.placement_supported is True
    assert preview.spec_preview["placement_prerequisites"] == ["bind_ppt_artifact"]


def test_animation_preview_marks_html_as_export_only():
    preview = build_studio_card_execution_preview(
        card_id="demonstration_animations",
        project_id="p-001",
        config={
            "topic": "植物生长全过程",
            "motion_brief": "突出种子发芽到开花结果的镜头变化",
            "duration_seconds": 10,
            "animation_format": "html5",
            "render_mode": "html5",
        },
    )

    payload = preview.initial_request.payload
    assert payload["type"] == "html"
    assert payload["content"]["format"] == "html5"
    assert preview.artifact_type == "html"
    assert preview.placement_supported is False
    assert "placement_ready_artifact" in preview.spec_preview["placement_prerequisites"]


@pytest.mark.asyncio
async def test_generate_video_uses_aliyun_wan_branch(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    generator = _MediaGenerator(tmp_path)

    async def _fake_render(content, storage_path):
        Path(storage_path).write_bytes(b"wan-mp4")
        return storage_path

    monkeypatch.setattr(
        "services.artifact_generator.media.render_aliyun_wan_video",
        _fake_render,
    )
    output = await generator.generate_video(
        {
            "title": "植物生长全过程",
            "render_mode": "cloud_video_wan",
            "cloud_video_provider": "aliyun_wan",
            "duration_seconds": 8,
            "scenes": [{"title": "发芽", "description": "种子破土"}],
        },
        "project-1",
        "artifact-mp4",
    )

    path = Path(output)
    assert path.exists()
    assert path.suffix == ".mp4"
    assert path.read_bytes() == b"wan-mp4"


@pytest.mark.asyncio
async def test_render_aliyun_wan_video_sets_task_metadata(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    from services.artifact_generator.cloud_video import render_aliyun_wan_video

    async def _fake_create_task(*, client, api_key, payload):
        assert payload["model"] == "wan2.7-i2v"
        assert payload["input"]["media"][0]["type"] == "first_frame"
        assert payload["input"]["media"][0]["url"].startswith("data:image/png;base64,")
        return "task-001"

    async def _fake_wait_for_task(*, client, api_key, task_id):
        assert task_id == "task-001"
        return {
            "output": {
                "task_status": "SUCCEEDED",
                "video_url": "https://example.com/wan-video.mp4",
            }
        }

    async def _fake_download_video(*, client, video_url, storage_path):
        Path(storage_path).write_bytes(b"wan-i2v")
        return storage_path

    monkeypatch.setattr(
        "services.artifact_generator.cloud_video._create_task",
        _fake_create_task,
    )
    monkeypatch.setattr(
        "services.artifact_generator.cloud_video._wait_for_task",
        _fake_wait_for_task,
    )
    monkeypatch.setattr(
        "services.artifact_generator.cloud_video._download_video",
        _fake_download_video,
    )

    content = {
        "title": "斜抛运动中的速度与轨迹",
        "summary": "展示轨迹、速度和重力影响",
        "focus": "强调轨迹和速度矢量",
        "render_mode": "cloud_video_wan",
        "cloud_video_provider": "aliyun_wan",
        "cloud_video_model": "wan2.7-i2v",
        "family_hint": "physics_mechanics",
        "duration_seconds": 8,
        "scenes": [{"title": "轨迹建立", "description": "观察初速度和重力影响"}],
    }
    target = tmp_path / "out.mp4"

    actual = await render_aliyun_wan_video(content, str(target))

    assert actual == str(target)
    assert target.read_bytes() == b"wan-i2v"
    assert content["cloud_video_task_id"] == "task-001"
    assert content["cloud_video_status"] == "succeeded"
    assert content["cloud_video_result_url"] == "https://example.com/wan-video.mp4"
    assert str(content["first_frame_asset_url"]).startswith("file://")


@pytest.mark.asyncio
async def test_load_artifact_content_supports_mp4_animation_snapshot():
    metadata = build_artifact_metadata(
        "mp4",
        {
            "kind": "animation_storyboard",
            "title": "植物生长全过程",
            "summary": "从种子到开花结果",
            "topic": "植物生长全过程",
            "format": "mp4",
            "duration_seconds": 10,
            "rhythm": "balanced",
            "focus": "根系、叶片、开花",
            "render_mode": "cloud_video_wan",
            "cloud_video_provider": "aliyun_wan",
            "cloud_video_prompt": "生成多镜头教学视频",
            "scenes": [{"title": "发芽", "description": "种子破土"}],
            "placements": [],
        },
        "u-001",
    )
    artifact = SimpleNamespace(type="mp4", metadata=metadata, storagePath=None)

    content = await load_artifact_content(artifact)

    assert content["format"] == "mp4"
    assert content["render_mode"] == "cloud_video_wan"
    assert content["cloud_video_provider"] == "aliyun_wan"
    assert content["scenes"][0]["title"] == "发芽"
