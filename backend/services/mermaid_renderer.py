"""Mermaid 渲染器 - 将 Mermaid 代码块转换为 SVG"""

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)


def render_mermaid_to_svg(mermaid_code: str) -> Optional[str]:
    """
    使用 Playwright 渲染 Mermaid 代码为 SVG

    Args:
        mermaid_code: Mermaid 图表代码

    Returns:
        SVG 字符串，失败返回 None
    """
    try:
        from playwright.sync_api import sync_playwright

        html_template = f"""
<!DOCTYPE html>
<html>
<head>
    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
        mermaid.initialize({{ startOnLoad: true, theme: 'default' }});
    </script>
</head>
<body>
    <div class="mermaid">
{mermaid_code}
    </div>
</body>
</html>
"""

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.set_content(html_template)
            page.wait_for_timeout(2000)  # 等待渲染

            svg = page.evaluate("""() => {
                const svg = document.querySelector('.mermaid svg');
                return svg ? svg.outerHTML : null;
            }""")

            browser.close()
            return svg

    except Exception as e:
        logger.warning(f"Mermaid rendering failed: {e}")
        return None


def preprocess_mermaid_blocks(markdown: str) -> str:
    """
    预处理 Markdown 中的 Mermaid 代码块，转换为 SVG

    Args:
        markdown: 包含 Mermaid 代码块的 Markdown

    Returns:
        替换后的 Markdown
    """
    pattern = r'```mermaid\n(.*?)\n```'

    def replace_block(match):
        mermaid_code = match.group(1)
        svg = render_mermaid_to_svg(mermaid_code)

        if svg:
            # 包装 SVG 在 div 中以保持样式
            return f'<div class="mermaid-rendered">\n{svg}\n</div>'
        else:
            # 渲染失败，保留原始代码块
            logger.warning("Mermaid rendering failed, keeping original code block")
            return match.group(0)

    return re.sub(pattern, replace_block, markdown, flags=re.DOTALL)
