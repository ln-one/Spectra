"""
模板渲染服务

负责管理 Marp 主题和 Pandoc 模板
支持多种教学风格的课件模板

设计原则：
- 独立模块：不依赖数据库和其他服务
- 可扩展：易于添加新模板风格
- 配置驱动：通过配置对象控制样式
"""

import logging
from pathlib import Path
from typing import Optional

try:
    from .marp_template import generate_marp_frontmatter
    from .marp_template import wrap_markdown_with_template as _wrap_markdown
    from .pandoc_template import get_pandoc_template_path as _get_pandoc_path
    from .types import TemplateConfig, TemplateStyle
except ImportError:
    import sys

    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from services.template.marp_template import (
        generate_marp_frontmatter,
    )
    from services.template.marp_template import (
        wrap_markdown_with_template as _wrap_markdown,
    )
    from services.template.pandoc_template import (
        get_pandoc_template_path as _get_pandoc_path,
    )
    from services.template.types import TemplateConfig, TemplateStyle

logger = logging.getLogger(__name__)


class TemplateService:
    """模板渲染服务 - 独立模块"""

    def __init__(self, templates_dir: str = "templates"):
        self.templates_dir = Path(templates_dir)
        self.templates_dir.mkdir(parents=True, exist_ok=True)
        logger.info(
            f"TemplateService initialized with templates_dir: {self.templates_dir}"
        )

    def get_marp_frontmatter(self, config: TemplateConfig, title: str) -> str:
        """
        生成 Marp Frontmatter（YAML 头部）

        Args:
            config: 模板配置
            title: 课件标题

        Returns:
            str: Marp frontmatter 字符串
        """
        return generate_marp_frontmatter(config, title)

    def get_pandoc_template_path(self, config: TemplateConfig) -> Optional[str]:
        """
        获取 Pandoc 模板路径

        Args:
            config: 模板配置

        Returns:
            str: 模板文件路径（如果存在）
        """
        return _get_pandoc_path(config, self.templates_dir)

    def wrap_markdown_with_template(
        self,
        markdown_content: str,
        config: TemplateConfig,
        title: str,
        style_manifest=None,
        extra_css=None,
        page_class_plan=None,
    ) -> str:
        """
        将 Markdown 内容包装为完整的 Marp 文档

        Args:
            markdown_content: 原始 Markdown 内容
            config: 模板配置
            title: 课件标题
            style_manifest: 样式清单（可选）
            extra_css: 额外 CSS（可选）
            page_class_plan: 页面 class 计划（可选）

        Returns:
            str: 包含 frontmatter 和样式的完整 Markdown
        """
        return _wrap_markdown(
            markdown_content,
            config,
            title,
            style_manifest,
            extra_css,
            page_class_plan,
        )


# 全局服务实例
template_service = TemplateService()

# 导出
__all__ = ["TemplateService", "TemplateStyle", "TemplateConfig", "template_service"]
