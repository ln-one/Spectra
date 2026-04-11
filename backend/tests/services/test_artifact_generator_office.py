from pathlib import Path

import pytest

from services.artifact_generator.office import ArtifactOfficeMixin


class _OfficeGenerator(ArtifactOfficeMixin):
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir

    def get_storage_path(self, project_id: str, artifact_type: str, artifact_id: str):
        ext = artifact_type
        target_dir = self.base_dir / project_id / artifact_type
        target_dir.mkdir(parents=True, exist_ok=True)
        return str(target_dir / f"{artifact_id}.{ext}")


@pytest.mark.asyncio
async def test_generate_pptx_uses_marp_renderer(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    generator = _OfficeGenerator(tmp_path)

    async def _render(storage_path: str, markdown: str) -> None:
        Path(storage_path).write_bytes(b"pptx")
        assert "# S1" in markdown

    monkeypatch.setattr(generator, "_render_pptx_with_marp", _render)

    output = await generator.generate_pptx(
        {"title": "Demo PPTX", "slides": [{"title": "S1", "content": "C1"}]},
        "project-1",
        "artifact-1",
    )

    path = Path(output)
    assert path.exists()
    assert path.suffix == ".pptx"
    assert path.read_bytes() == b"pptx"


@pytest.mark.asyncio
async def test_generate_docx_uses_pandoc_renderer(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    generator = _OfficeGenerator(tmp_path)

    async def _render(storage_path: str, markdown: str) -> None:
        Path(storage_path).write_bytes(b"docx")
        assert "# Demo DOCX" in markdown

    monkeypatch.setattr(generator, "_render_docx_with_pandoc", _render)

    output = await generator.generate_docx(
        {
            "title": "Demo DOCX",
            "sections": [{"title": "Intro", "content": "Hello"}],
        },
        "project-1",
        "artifact-2",
    )

    path = Path(output)
    assert path.exists()
    assert path.suffix == ".docx"
    assert path.read_bytes() == b"docx"


@pytest.mark.asyncio
async def test_generate_pptx_fails_explicitly_when_marp_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    generator = _OfficeGenerator(tmp_path)

    async def _render_fail(*args, **kwargs) -> None:
        raise RuntimeError("marp_render_failed")

    monkeypatch.setattr(generator, "_render_pptx_with_marp", _render_fail)

    with pytest.raises(RuntimeError, match="marp_render_failed"):
        await generator.generate_pptx(
            {"title": "Demo PPTX", "slides": [{"title": "S1", "content": "C1"}]},
            "project-1",
            "artifact-disabled",
        )
