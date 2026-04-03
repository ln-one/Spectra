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

