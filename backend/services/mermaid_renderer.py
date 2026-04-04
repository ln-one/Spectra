"""Mermaid 渲染器 - 将 Mermaid 代码块转换为 SVG。"""

from __future__ import annotations

import base64
import hashlib
import html
import json
import logging
import os
import re
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_MERMAID_BLOCK_PATTERN = re.compile(r"```mermaid\s*\n(.*?)\n```", re.DOTALL)
_SVG_BLOCK_PATTERN = re.compile(r"<svg\b.*?</svg>", re.DOTALL | re.IGNORECASE)
_EDGE_LABEL_PATTERN = re.compile(r"\|([^|\n]+)\|")
_DEFAULT_MERMAID_MODULE_URL = (
    "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs"
)
_NODE_LABEL_PATTERN = re.compile(r"\[([^\]\n]+)\]")


class MermaidRenderError(RuntimeError):
    """Raised when Mermaid blocks cannot be rendered safely."""


def _svg_to_data_uri_markdown(svg_markup: str) -> str:
    """Convert raw SVG markup into a Markdown image data URI."""
    svg_bytes = svg_markup.encode("utf-8")
    svg_b64 = base64.b64encode(svg_bytes).decode("ascii")
    return "![Mermaid Diagram]" f"(data:image/svg+xml;base64,{svg_b64})"


def _svg_to_file_markdown(
    svg_markup: str,
    *,
    asset_dir: Path,
    asset_prefix: str,
) -> str:
    """Persist SVG into local file and return Markdown image reference."""
    digest = hashlib.sha1(svg_markup.encode("utf-8")).hexdigest()[:16]
    filename = f"{asset_prefix}_{digest}.svg"
    output_path = asset_dir / filename
    output_path.write_text(svg_markup, encoding="utf-8")
    return f"![Mermaid Diagram]({filename})"


def _svg_to_markdown(
    svg_markup: str,
    *,
    asset_dir: Optional[Path],
    asset_prefix: str,
) -> str:
    """
    Convert SVG to Markdown image.

    Prefer local file reference when asset_dir is provided because Marp may treat
    markdown data URI links as literal text in some pipelines.
    """
    if asset_dir is not None:
        return _svg_to_file_markdown(
            svg_markup,
            asset_dir=asset_dir,
            asset_prefix=asset_prefix,
        )
    return _svg_to_data_uri_markdown(svg_markup)


def _resolve_mermaid_module_url() -> str:
    """
    Resolve Mermaid ESM module URL.

    Priority:
    1. MERMAID_ESM_URL env override (supports local file path or URL)
    2. Default CDN URL
    """
    configured = str(os.getenv("MERMAID_ESM_URL") or "").strip()
    if not configured:
        return _DEFAULT_MERMAID_MODULE_URL

    local_candidate = Path(configured)
    if local_candidate.exists():
        return local_candidate.resolve().as_uri()
    return configured


def _fallback_mermaid_placeholder_svg() -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" '
        'viewBox="0 0 1280 720" role="img" aria-label="Mermaid fallback">'
        '<rect width="1280" height="720" fill="#f5f7fb"/>'
        '<rect x="80" y="80" width="1120" height="560" rx="24" fill="#ffffff" '
        'stroke="#cad2e2" stroke-width="4"/>'
        '<text x="640" y="328" text-anchor="middle" fill="#3a4b6a" '
        'font-family="Arial, sans-serif" font-size="44" font-weight="700">'
        "Mermaid Diagram Unavailable</text>"
        '<text x="640" y="390" text-anchor="middle" fill="#6d7f9c" '
        'font-family="Arial, sans-serif" font-size="30">'
        "Rendering fallback applied</text>"
        "</svg>"
    )


def _fallback_mermaid_placeholder_markdown(
    *,
    asset_dir: Optional[Path],
    asset_prefix: str,
) -> str:
    return _svg_to_markdown(
        _fallback_mermaid_placeholder_svg(),
        asset_dir=asset_dir,
        asset_prefix=asset_prefix,
    )


def _repair_mermaid_code(mermaid_code: str) -> str:
    """
    Apply conservative Mermaid syntax repairs for common LLM mistakes.

    Current fix:
    - Edge labels like |P(empty)| can break parser in flowchart grammar.
      Replace ASCII parentheses with full-width variants inside edge labels.
    - Node labels like P2[P(empty) 申请空槽] can also break parser in some
      Mermaid grammar versions. Replace ASCII parentheses within [] labels.
    """
    repaired_any = False

    def _replace_edge_label(match: re.Match[str]) -> str:
        nonlocal repaired_any
        label = match.group(1)
        repaired = label.replace("(", "（").replace(")", "）")
        if repaired != label:
            repaired_any = True
        return f"|{repaired}|"

    repaired_code = _EDGE_LABEL_PATTERN.sub(_replace_edge_label, mermaid_code)

    def _replace_node_label(match: re.Match[str]) -> str:
        nonlocal repaired_any
        label = match.group(1)
        repaired = label.replace("(", "（").replace(")", "）")
        if repaired != label:
            repaired_any = True
        return f"[{repaired}]"

    repaired_code = _NODE_LABEL_PATTERN.sub(_replace_node_label, repaired_code)
    return repaired_code if repaired_any else mermaid_code


async def render_mermaid_to_svg(mermaid_code: str) -> Optional[str]:
    """
    使用 Playwright Async API 渲染 Mermaid 代码为 SVG。

    Args:
        mermaid_code: Mermaid 图表代码

    Returns:
        SVG 字符串，失败返回 None
    """
    try:
        from playwright.async_api import async_playwright

        escaped_code = html.escape(mermaid_code)
        module_url_literal = json.dumps(_resolve_mermaid_module_url())
        html_template = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
</head>
<body>
    <pre id="mermaid-source" style="display:none;">{escaped_code}</pre>
    <div id="mermaid-container"></div>
    <script type="module">
        import mermaid from {module_url_literal};

        const source = document.getElementById('mermaid-source').textContent;
        const container = document.getElementById('mermaid-container');

        try {{
            mermaid.initialize({{ startOnLoad: false, theme: 'default' }});
            const result = await mermaid.render('spectra-mermaid-svg', source);
            container.innerHTML = result.svg;
            window.__MERMAID_RENDER_STATUS__ = 'done';
        }} catch (error) {{
            window.__MERMAID_RENDER_STATUS__ = 'error';
            window.__MERMAID_RENDER_ERROR__ = String(error);
        }}
    </script>
</body>
</html>
"""

        async with async_playwright() as p:
            launch_kwargs = {"headless": True}
            chrome_path = str(os.getenv("CHROME_PATH") or "").strip()
            if chrome_path:
                if Path(chrome_path).exists():
                    launch_kwargs["executable_path"] = chrome_path
                    launch_kwargs["args"] = [
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                    ]
                else:
                    logger.warning(
                        "CHROME_PATH is set but not found: %s; "
                        "fallback to Playwright managed browser",
                        chrome_path,
                    )
            browser = await p.chromium.launch(**launch_kwargs)
            try:
                page = await browser.new_page()
                await page.set_content(html_template, wait_until="domcontentloaded")
                await page.wait_for_function(
                    """() => (
                        window.__MERMAID_RENDER_STATUS__ === 'done' ||
                        window.__MERMAID_RENDER_STATUS__ === 'error'
                    )""",
                    timeout=120_000,
                )

                status = await page.evaluate("window.__MERMAID_RENDER_STATUS__")
                if status != "done":
                    error_message = await page.evaluate(
                        "window.__MERMAID_RENDER_ERROR__ || 'unknown mermaid error'"
                    )
                    logger.warning(
                        "Mermaid rendering failed in browser: %s", error_message
                    )
                    return None

                return await page.evaluate("""() => {
                    const svg = document.querySelector('#mermaid-container svg');
                    return svg ? svg.outerHTML : null;
                }""")
            finally:
                await browser.close()

    except Exception as exc:
        logger.warning("Mermaid rendering failed: %s", exc)
        return None


async def preprocess_mermaid_blocks(
    markdown: str,
    *,
    fail_on_unrendered: bool = True,
    asset_dir: Optional[str | Path] = None,
    asset_prefix: str = "mermaid",
) -> str:
    """
    预处理 Markdown 中的 Mermaid 代码块，转换为 SVG。

    Args:
        markdown: 包含 Mermaid 代码块的 Markdown
        fail_on_unrendered: Mermaid 块渲染失败时是否抛错（默认严格）

    Returns:
        替换后的 Markdown
    """
    rendered_markdown = markdown
    normalized_asset_dir: Optional[Path] = None
    if asset_dir is not None:
        normalized_asset_dir = Path(asset_dir)
        normalized_asset_dir.mkdir(parents=True, exist_ok=True)

    matches = list(_MERMAID_BLOCK_PATTERN.finditer(markdown))

    for match in reversed(matches):
        mermaid_code = match.group(1)
        svg = await render_mermaid_to_svg(mermaid_code)
        if not svg:
            repaired_code = _repair_mermaid_code(mermaid_code)
            if repaired_code != mermaid_code:
                logger.info("Retrying Mermaid render with repaired edge-label syntax")
                svg = await render_mermaid_to_svg(repaired_code)
        if svg:
            replacement = _svg_to_markdown(
                svg,
                asset_dir=normalized_asset_dir,
                asset_prefix=asset_prefix,
            )
        else:
            logger.warning("Mermaid rendering failed for one block")
            if fail_on_unrendered:
                raise MermaidRenderError(
                    "Mermaid rendering failed: block could not be converted to image"
                )
            replacement = _fallback_mermaid_placeholder_markdown(
                asset_dir=normalized_asset_dir,
                asset_prefix=asset_prefix,
            )

        rendered_markdown = (
            rendered_markdown[: match.start()]
            + replacement
            + rendered_markdown[match.end() :]
        )

    # Compatibility normalization:
    # if upstream markdown already contains raw <svg> (e.g. historical behavior),
    # force-convert it to a markdown image data URI to avoid source text in slides.
    svg_matches = list(_SVG_BLOCK_PATTERN.finditer(rendered_markdown))
    for match in reversed(svg_matches):
        replacement = _svg_to_markdown(
            match.group(0),
            asset_dir=normalized_asset_dir,
            asset_prefix=asset_prefix,
        )
        rendered_markdown = (
            rendered_markdown[: match.start()]
            + replacement
            + rendered_markdown[match.end() :]
        )

    # Final guard: never allow raw Mermaid source to leak into output in strict mode.
    if fail_on_unrendered:
        if _MERMAID_BLOCK_PATTERN.search(rendered_markdown):
            raise MermaidRenderError(
                "Mermaid source block remained after preprocessing"
            )
        if _SVG_BLOCK_PATTERN.search(rendered_markdown):
            raise MermaidRenderError("Raw SVG markup remained after preprocessing")

    return rendered_markdown
