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
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
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
