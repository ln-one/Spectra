"""测试 Mermaid 渲染器。"""

from __future__ import annotations

import pytest

from services import mermaid_renderer


@pytest.mark.asyncio
async def test_mermaid_preprocessing_replaces_blocks(monkeypatch):
    """渲染成功时应替换 Mermaid 代码块。"""

    markdown = """# 测试页面

这是一些文字。

```mermaid
graph TD
    A[开始] --> B[结束]
```

更多文字。
"""

    async def _fake_render_mermaid_to_svg(mermaid_code: str) -> str:
        assert "graph TD" in mermaid_code
        return "<svg><text>rendered</text></svg>"

    monkeypatch.setattr(
        mermaid_renderer,
        "render_mermaid_to_svg",
        _fake_render_mermaid_to_svg,
    )

    result = await mermaid_renderer.preprocess_mermaid_blocks(markdown)

    assert "```mermaid" not in result
    assert '<div class="mermaid-rendered">' in result
    assert "<svg><text>rendered</text></svg>" in result


@pytest.mark.asyncio
async def test_mermaid_preprocessing_keeps_original_block_on_failure(monkeypatch):
    """渲染失败时应保留原始 Mermaid 代码块。"""

    markdown = """```mermaid
graph LR
    X --> Y
```"""

    async def _fake_render_mermaid_to_svg(_mermaid_code: str):
        return None

    monkeypatch.setattr(
        mermaid_renderer,
        "render_mermaid_to_svg",
        _fake_render_mermaid_to_svg,
    )

    result = await mermaid_renderer.preprocess_mermaid_blocks(markdown)

    assert result == markdown
