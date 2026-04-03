"""
模板服务 - CSS 生成器
"""

import logging

try:
    from .types import TemplateConfig
except ImportError:
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from services.template.types import TemplateConfig

logger = logging.getLogger(__name__)


def generate_design_family_css(design_name: str) -> str:
    """生成设计家族基础 CSS（仅支持 academic_modern）"""
    return _ACADEMIC_MODERN_CSS + "\n" + _MERMAID_STYLES


def compile_manifest_css(manifest: dict) -> str:
    """从 manifest 编译 CSS 变量"""
    palette = manifest.get("palette", {})
    typography = manifest.get("typography", {})

    css_vars = []
    for key, value in palette.items():
        css_vars.append(f"  --color-{key}: {value};")
    for key, value in typography.items():
        css_vars.append(f"  --font-{key}: {value};")

    if not css_vars:
        return ""

    return "section {\n" + "\n".join(css_vars) + "\n}"


_ACADEMIC_MODERN_CSS = """
/* Academic Modern Design Family */
section {
  background: #fafafa;
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 26px;
  line-height: 1.7;
  padding: 60px 70px;
  color: #2c2c2c;
}

section.cover {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

section.cover h1 {
  font-size: 64px;
  font-weight: 400;
  margin: 0 0 20px 0;
  letter-spacing: -1px;
}

section.cover h2 {
  font-size: 28px;
  font-weight: 300;
  margin: 0;
  opacity: 0.9;
}

section.toc {
  background: #fff;
}

section.toc h1 {
  font-size: 42px;
  font-weight: 400;
  margin-bottom: 40px;
  color: #667eea;
  border-bottom: 2px solid #667eea;
  padding-bottom: 10px;
}

section.toc ul {
  list-style: decimal;
  padding-left: 30px;
}

section.toc li {
  font-size: 28px;
  margin-bottom: 18px;
  line-height: 1.6;
}

section.content {
  background: #fff;
}

section.content h1 {
  font-size: 44px;
  font-weight: 400;
  margin-bottom: 35px;
  color: #667eea;
  border-bottom: 2px solid #e0e0e0;
  padding-bottom: 10px;
}

section.content h2 {
  font-size: 32px;
  font-weight: 400;
  margin: 25px 0 15px 0;
  color: #764ba2;
}

section.density-sparse ul li {
  margin-bottom: 25px;
}

section.density-medium ul li {
  margin-bottom: 16px;
}

section.density-dense ul li {
  margin-bottom: 10px;
  font-size: 24px;
}

.lead {
  font-size: 32px;
  font-style: italic;
  color: #555;
}

.callout {
  background: #f5f3ff;
  padding: 25px;
  border-left: 4px solid #667eea;
  margin: 25px 0;
  font-size: 24px;
}
"""

_MERMAID_STYLES = """
/* Mermaid chart styles */
.mermaid {
  display: block;
  margin: 20px auto;
  max-width: 90%;
  max-height: 400px;
}

/* Mermaid images converted by backend preprocessor */
img[alt="Mermaid Diagram"] {
  display: block;
  margin: 12px auto;
  max-width: min(88%, 920px);
  max-height: min(30vh, 220px);
  width: auto !important;
  height: auto !important;
  object-fit: contain;
}

section.density-sparse img[alt="Mermaid Diagram"] {
  max-height: min(42vh, 320px);
}

section.density-medium img[alt="Mermaid Diagram"] {
  max-height: min(30vh, 220px);
}

section.density-dense img[alt="Mermaid Diagram"] {
  max-height: min(22vh, 160px);
}

section.cover .mermaid,
section.toc .mermaid,
section.cover img[alt="Mermaid Diagram"],
section.toc img[alt="Mermaid Diagram"] {
  display: none;
}
"""


def generate_custom_css(config: TemplateConfig) -> str:
    """
    生成自定义 CSS（用于覆盖 Marp 主题样式）

    Args:
        config: 模板配置

    Returns:
        str: CSS 样式字符串
    """
    css = f"""
section {{
  background-color: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  font-size: 28px;
  line-height: 1.6;
  padding: 60px;
}}

h1 {{
  color: {config.primary_color};
  border-bottom: 3px solid {config.primary_color};
  padding-bottom: 10px;
  margin-bottom: 30px;
  font-size: 48px;
  font-weight: 700;
}}

h2 {{
  color: {config.primary_color};
  margin-top: 30px;
  margin-bottom: 20px;
  font-size: 36px;
  font-weight: 600;
}}

h3 {{
  color: #555555;
  margin-top: 20px;
  margin-bottom: 15px;
  font-size: 28px;
  font-weight: 600;
}}

strong {{
  color: {config.primary_color};
  font-weight: 700;
}}

em {{
  color: #666666;
  font-style: italic;
}}

/* 列表样式 */
ul, ol {{
  margin-left: 30px;
  margin-top: 15px;
  margin-bottom: 15px;
}}

li {{
  margin-bottom: 10px;
  line-height: 1.8;
}}

/* 代码块样式 */
code {{
  background-color: #f5f5f5;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 24px;
  color: #e83e8c;
}}

pre {{
  background-color: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  border-left: 4px solid {config.primary_color};
  overflow-x: auto;
}}

pre code {{
  background-color: transparent;
  padding: 0;
  color: #333333;
  font-size: 22px;
}}

/* 引用样式 */
blockquote {{
  border-left: 4px solid {config.primary_color};
  padding-left: 20px;
  margin-left: 0;
  color: #666666;
  font-style: italic;
  background-color: #f8f9fa;
  padding: 15px 20px;
  border-radius: 4px;
}}

/* 表格样式 */
table {{
  border-collapse: collapse;
  width: 100%;
  margin: 20px 0;
}}

th {{
  background-color: {config.primary_color};
  color: white;
  padding: 12px;
  text-align: left;
  font-weight: 600;
}}

td {{
  border: 1px solid #dddddd;
  padding: 12px;
}}

tr:nth-child(even) {{
  background-color: #f8f9fa;
}}

/* 链接样式 */
a {{
  color: {config.primary_color};
  text-decoration: none;
  border-bottom: 1px solid {config.primary_color};
}}

a:hover {{
  opacity: 0.8;
}}

/* 响应式设计 */
@media (max-width: 1024px) {{
  section {{
    font-size: 24px;
    padding: 40px;
  }}

  h1 {{
    font-size: 40px;
  }}

  h2 {{
    font-size: 32px;
  }}
}}
"""
    logger.debug(f"Generated custom CSS with primary color: {config.primary_color}")
    return css
