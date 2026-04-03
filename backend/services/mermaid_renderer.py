"""Mermaid 渲染器 - 将 Mermaid 代码块转换为 SVG。"""

from __future__ import annotations

import html
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

_MERMAID_BLOCK_PATTERN = re.compile(r"```mermaid\s*\n(.*?)\n```", re.DOTALL)


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
        import mermaid from
          'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';

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
            browser = await p.chromium.launch(headless=True)
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


async def preprocess_mermaid_blocks(markdown: str) -> str:
    """
    预处理 Markdown 中的 Mermaid 代码块，转换为 SVG。

    Args:
        markdown: 包含 Mermaid 代码块的 Markdown

    Returns:
        替换后的 Markdown
    """
    rendered_markdown = markdown
    matches = list(_MERMAID_BLOCK_PATTERN.finditer(markdown))

    for match in reversed(matches):
        mermaid_code = match.group(1)
        svg = await render_mermaid_to_svg(mermaid_code)
        if svg:
            replacement = f'<div class="mermaid-rendered">\n{svg}\n</div>'
        else:
            logger.warning(
                "Mermaid rendering failed, keeping original code block"
            )
            replacement = match.group(0)

        rendered_markdown = (
            rendered_markdown[: match.start()]
            + replacement
            + rendered_markdown[match.end() :]
        )

    return rendered_markdown
