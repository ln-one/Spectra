"""测试 Mermaid 渲染器。"""

from __future__ import annotations

from pathlib import Path

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
    assert "data:image/svg+xml;base64," in result
    assert "Mermaid Diagram" in result


@pytest.mark.asyncio
async def test_mermaid_preprocessing_keeps_original_block_on_failure(monkeypatch):
    """严格模式下渲染失败应直接报错，避免源码泄漏。"""

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

    with pytest.raises(mermaid_renderer.MermaidRenderError):
        await mermaid_renderer.preprocess_mermaid_blocks(markdown)


@pytest.mark.asyncio
async def test_mermaid_preprocessing_non_strict_keeps_original_block(monkeypatch):
    """非严格模式下允许保留原始 Mermaid 代码块。"""

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

    result = await mermaid_renderer.preprocess_mermaid_blocks(
        markdown,
        fail_on_unrendered=False,
    )

    assert result == markdown


@pytest.mark.asyncio
async def test_mermaid_preprocessing_writes_svg_asset_when_asset_dir(
    monkeypatch, tmp_path: Path
):
    """指定 asset_dir 时应落地 SVG 文件并使用本地路径引用。"""

    markdown = """```mermaid
graph TD
    A[开始] --> B[结束]
```"""

    async def _fake_render_mermaid_to_svg(_mermaid_code: str):
        return "<svg><text>asset</text></svg>"

    monkeypatch.setattr(
        mermaid_renderer,
        "render_mermaid_to_svg",
        _fake_render_mermaid_to_svg,
    )

    result = await mermaid_renderer.preprocess_mermaid_blocks(
        markdown,
        asset_dir=tmp_path,
        asset_prefix="case",
    )

    assert "data:image/svg+xml;base64," not in result
    assert "![Mermaid Diagram](case_" in result
    assert result.strip().endswith(".svg)")
    assets = list(tmp_path.glob("case_*.svg"))
    assert len(assets) == 1
    assert "<svg><text>asset</text></svg>" in assets[0].read_text(encoding="utf-8")


@pytest.mark.asyncio
async def test_mermaid_preprocessing_retries_with_repaired_edge_label(monkeypatch):
    """首次失败后应尝试修复边标签语法并重新渲染。"""

    markdown = """```mermaid
graph LR
    Producer[生产者] -->|P(empty)| Buffer[缓冲区]
```"""

    calls: list[str] = []

    async def _fake_render_mermaid_to_svg(mermaid_code: str):
        calls.append(mermaid_code)
        if "|P(empty)|" in mermaid_code:
            return None
        if "|P（empty）|" in mermaid_code:
            return "<svg><text>rendered-after-repair</text></svg>"
        return None

    monkeypatch.setattr(
        mermaid_renderer,
        "render_mermaid_to_svg",
        _fake_render_mermaid_to_svg,
    )

    result = await mermaid_renderer.preprocess_mermaid_blocks(markdown)

    assert len(calls) == 2
    assert "|P(empty)|" in calls[0]
    assert "|P（empty）|" in calls[1]
    assert "data:image/svg+xml;base64," in result
    assert "```mermaid" not in result


@pytest.mark.asyncio
async def test_mermaid_preprocessing_retries_with_repaired_node_label(monkeypatch):
    """首轮失败后应修复方括号节点标签中的括号并重试渲染。"""

    markdown = """```mermaid
graph TD
    P1[生产数据] --> P2[P(empty) 申请空槽]
```"""

    calls: list[str] = []

    async def _fake_render_mermaid_to_svg(mermaid_code: str):
        calls.append(mermaid_code)
        if "P2[P(empty) 申请空槽]" in mermaid_code:
            return None
        if "P2[P（empty） 申请空槽]" in mermaid_code:
            return "<svg><text>rendered-after-node-repair</text></svg>"
        return None

    monkeypatch.setattr(
        mermaid_renderer,
        "render_mermaid_to_svg",
        _fake_render_mermaid_to_svg,
    )

    result = await mermaid_renderer.preprocess_mermaid_blocks(markdown)

    assert len(calls) == 2
    assert "P2[P(empty) 申请空槽]" in calls[0]
    assert "P2[P（empty） 申请空槽]" in calls[1]
    assert "data:image/svg+xml;base64," in result
    assert "```mermaid" not in result


@pytest.mark.asyncio
async def test_mermaid_preprocessing_normalizes_raw_svg_markup():
    """原始 SVG 标记应被标准化为 data URI 图片，避免源码直出。"""

    markdown = """# 页面

<svg id="spectra-mermaid-svg"><text>raw</text></svg>
"""

    result = await mermaid_renderer.preprocess_mermaid_blocks(markdown)

    assert "<svg" not in result
    assert "data:image/svg+xml;base64," in result
