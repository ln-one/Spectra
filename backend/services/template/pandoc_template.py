"""
模板服务 - Pandoc 模板管理器
"""

import logging
from pathlib import Path
from typing import Optional

try:
    from .types import TemplateConfig
except ImportError:
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from services.template.types import TemplateConfig

logger = logging.getLogger(__name__)


def get_pandoc_template_path(
    config: TemplateConfig,
    templates_dir: Path
) -> Optional[str]:
    """
    获取 Pandoc 模板路径

    Args:
        config: 模板配置
        templates_dir: 模板目录

    Returns:
        str: 模板文件路径（如果存在）
    """
    # 检查是否存在对应风格的自定义模板
    template_file = templates_dir / f"{config.style.value}_template.docx"
    if template_file.exists():
        logger.info(f"Using custom Pandoc template: {template_file}")
        return str(template_file)

    # 检查是否存在默认模板
    default_template = templates_dir / "default_template.docx"
    if default_template.exists():
        logger.info(f"Using default Pandoc template: {default_template}")
        return str(default_template)

    logger.debug("No custom Pandoc template found, using Pandoc default")
    return None
