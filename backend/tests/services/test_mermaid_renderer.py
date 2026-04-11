from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from services.mermaid_renderer import (
    MermaidRenderError,
    _normalize_svg_markup,
    preprocess_mermaid_blocks,
)


@pytest.mark.asyncio
async def test_preprocess_mermaid_blocks_non_strict_preserves_original_block(tmp_path):
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

    assert "```mermaid" in rendered
    assert "graph TD" in rendered
    assert list(tmp_path.glob("case_*.svg")) == []


@pytest.mark.asyncio
async def test_preprocess_mermaid_blocks_strict_mode_raises_on_failure():
    markdown = "```mermaid\ngraph TD\nA-->B\n```"
    with patch(
        "services.mermaid_renderer.render_mermaid_to_svg",
        new=AsyncMock(return_value=None),
    ):
        with pytest.raises(MermaidRenderError):
            await preprocess_mermaid_blocks(markdown, fail_on_unrendered=True)


def test_normalize_svg_markup_fixes_br_and_validates_xml():
    broken_svg = (
        '<svg xmlns="http://www.w3.org/2000/svg">'
        '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">'
        "line1<br>line2"
        "</div></foreignObject></svg>"
    )
    normalized = _normalize_svg_markup(broken_svg)
    assert normalized is not None
    assert "<br/>" in normalized


@pytest.mark.asyncio
async def test_preprocess_mermaid_blocks_non_strict_preserves_original_block_on_invalid_svg(
    tmp_path,
):
    markdown = "```mermaid\ngraph TD\nA-->B\n```"
    with patch(
        "services.mermaid_renderer.render_mermaid_to_svg",
        new=AsyncMock(return_value="<svg><g></svg>"),
    ):
        rendered = await preprocess_mermaid_blocks(
            markdown,
            fail_on_unrendered=False,
            asset_dir=tmp_path,
            asset_prefix="invalid",
        )

    assert "```mermaid" in rendered
    assert "graph TD" in rendered
