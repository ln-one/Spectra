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
async def test_generate_animation_writes_real_gif(tmp_path: Path):
    generator = _MediaGenerator(tmp_path)
    output = await generator.generate_animation(
        {"title": "冒泡排序", "scenes": [{"title": "Scene 1", "description": "交换"}]},
        "project-1",
        "artifact-gif",
    )
    path = Path(output)
    assert path.exists()
    assert path.suffix == ".gif"
    assert path.stat().st_size > 0


@pytest.mark.asyncio
async def test_generate_video_uses_cv2_writer(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    generator = _MediaGenerator(tmp_path)

    class _FakeWriter:
        def __init__(self, path, *args):
            self.path = Path(path)
            self.frames = []
            self._opened = True

        def isOpened(self):
            return self._opened

        def write(self, frame):
            self.frames.append(frame)

        def release(self):
            self.path.write_bytes(b"real-mp4-bytes")

    class _FakeCv2:
        COLOR_RGB2BGR = 1

        @staticmethod
        def VideoWriter(path, *args):
            return _FakeWriter(path, *args)

        @staticmethod
        def VideoWriter_fourcc(*args):
            return 0

        @staticmethod
        def cvtColor(frame, _code):
            return frame

    monkeypatch.setitem(__import__("sys").modules, "cv2", _FakeCv2)
    output = await generator.generate_video(
        {"title": "冒泡排序", "scenes": [{"title": "Scene 1", "description": "交换"}]},
        "project-1",
        "artifact-mp4",
    )
    path = Path(output)
    assert path.exists()
    assert path.suffix == ".mp4"
    assert path.stat().st_size > 0
