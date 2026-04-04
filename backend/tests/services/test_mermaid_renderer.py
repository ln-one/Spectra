from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from services.mermaid_renderer import MermaidRenderError, preprocess_mermaid_blocks


@pytest.mark.asyncio
async def test_preprocess_mermaid_blocks_non_strict_fallback_to_placeholder(tmp_path):
    markdown = "```mermaid\ngraph TD\nA-->B\n```"
    with patch(
        "services.mermaid_renderer.render_mermaid_to_svg",
        new=AsyncMock(return_value=None),
    ):
        rendered = await preprocess_mermaid_blocks(
            markdown,
            fail_on_unrendered=False,
            asset_dir=tmp_path,
            asset_prefix="case",
        )

    assert "```mermaid" not in rendered
    assert "![Mermaid Diagram](" in rendered
    assert any(Path(path).suffix == ".svg" for path in tmp_path.glob("case_*.svg"))


@pytest.mark.asyncio
async def test_preprocess_mermaid_blocks_strict_mode_raises_on_failure():
    markdown = "```mermaid\ngraph TD\nA-->B\n```"
    with patch(
        "services.mermaid_renderer.render_mermaid_to_svg",
        new=AsyncMock(return_value=None),
    ):
        with pytest.raises(MermaidRenderError):
            await preprocess_mermaid_blocks(markdown, fail_on_unrendered=True)
