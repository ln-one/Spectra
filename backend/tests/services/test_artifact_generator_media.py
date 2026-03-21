from pathlib import Path

import pytest

from services.artifact_generator.media import ArtifactMediaMixin


class _MediaGenerator(ArtifactMediaMixin):
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir

    def get_storage_path(self, project_id: str, artifact_type: str, artifact_id: str):
        target_dir = self.base_dir / project_id / artifact_type
        target_dir.mkdir(parents=True, exist_ok=True)
        return str(target_dir / f"{artifact_id}.{artifact_type}")


@pytest.mark.asyncio
async def test_generate_animation_fails_explicitly_when_placeholder_disabled(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    generator = _MediaGenerator(tmp_path)
    monkeypatch.delenv("ALLOW_MEDIA_PLACEHOLDER_ARTIFACTS", raising=False)

    with pytest.raises(RuntimeError, match="media placeholder artifacts are disabled"):
        await generator.generate_animation({}, "project-1", "artifact-gif")


@pytest.mark.asyncio
async def test_generate_video_placeholder_fails_explicitly_when_placeholder_disabled(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    generator = _MediaGenerator(tmp_path)
    monkeypatch.delenv("ALLOW_MEDIA_PLACEHOLDER_ARTIFACTS", raising=False)

    with pytest.raises(RuntimeError, match="media placeholder artifacts are disabled"):
        await generator.generate_video_placeholder("project-1", "artifact-mp4")


@pytest.mark.asyncio
async def test_generate_video_placeholder_respects_explicit_dev_flag(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    generator = _MediaGenerator(tmp_path)
    monkeypatch.setenv("ALLOW_MEDIA_PLACEHOLDER_ARTIFACTS", "true")

    output = await generator.generate_video_placeholder("project-1", "artifact-mp4")
    path = Path(output)
    assert path.exists()
    assert path.suffix == ".mp4"
    assert path.stat().st_size > 0
