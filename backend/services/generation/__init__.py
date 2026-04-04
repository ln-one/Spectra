"""
课件生成服务 - 主服务类

负责将 AI 生成的 Markdown 内容转换为 PPT 和 Word 文件
技术栈：Marp CLI (Markdown → PPTX) + Pandoc (Markdown → DOCX)

设计原则：
- 高内聚：只负责文件生成，不涉及数据库/认证
- 低耦合：输入是 Markdown 字符串，可用 Mock 数据独立测试
- 接口契约：与成员 D 的 AI 服务约定 Markdown 格式
"""

import logging
import os
import re
from pathlib import Path
from typing import Any, Optional

try:
    from ..runtime_paths import get_generated_dir
    from ..template import TemplateConfig, TemplateService
    from .marp_generator import generate_pptx as _generate_pptx
    from .marp_generator import generate_slide_images as _generate_slide_images
    from .pandoc_generator import generate_docx as _generate_docx
    from .tool_checker import check_tools_installed
    from .types import CoursewareContent
except ImportError:
    import sys

    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from services.generation.marp_generator import generate_pptx as _generate_pptx
    from services.generation.marp_generator import (
        generate_slide_images as _generate_slide_images,
    )
    from services.generation.pandoc_generator import generate_docx as _generate_docx
    from services.generation.tool_checker import check_tools_installed
    from services.generation.types import CoursewareContent
    from services.runtime_paths import get_generated_dir
    from services.template import TemplateConfig, TemplateService

logger = logging.getLogger(__name__)

_MERMAID_IMAGE_FIT_CSS = """
<style>
/* Enforced Mermaid image fit rules (runtime guard) */
section img[alt="Mermaid Diagram"] {
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

section.cover img[alt="Mermaid Diagram"],
section.toc img[alt="Mermaid Diagram"] {
  display: none !important;
}
</style>
"""


def _is_truthy(value: str) -> bool:
    normalized = str(value or "").strip().lower()
    return normalized in {"1", "true", "yes", "y", "on"}


def _should_fail_on_unrendered_mermaid() -> bool:
    """
    Control whether Mermaid rendering failure should fail whole generation.

    Default is non-blocking to protect main generation path from transient
    browser/network issues.
    """
    return _is_truthy(os.getenv("MERMAID_STRICT_MODE", "false"))


def _inject_mermaid_fit_css(markdown: str) -> str:
    """
    Ensure Mermaid image fit CSS is always present in final Marp document.

    This is a runtime guard independent from prompt/model output.
    """
    if 'img[alt="Mermaid Diagram"]' in markdown:
        return markdown

    style_close = "</style>"
    index = markdown.find(style_close)
    if index != -1:
        insert_pos = index + len(style_close)
        return (
            markdown[:insert_pos]
            + "\n\n"
            + _MERMAID_IMAGE_FIT_CSS.strip()
            + "\n"
            + markdown[insert_pos:]
        )

    frontmatter_match = re.match(r"^\s*---\s*\n[\s\S]*?\n---\s*\n?", markdown)
    if frontmatter_match:
        insert_pos = frontmatter_match.end()
        return (
            markdown[:insert_pos]
            + "\n"
            + _MERMAID_IMAGE_FIT_CSS.strip()
            + "\n"
            + markdown[insert_pos:]
        )

    return _MERMAID_IMAGE_FIT_CSS.strip() + "\n\n" + markdown


def _serialize_model_like(value: Any) -> Optional[dict]:
    """Serialize Pydantic model-like or dict payload to plain dict."""
    if value is None:
        return None
    if isinstance(value, dict):
        return value

    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        dumped = model_dump()
        return dumped if isinstance(dumped, dict) else None

    to_dict = getattr(value, "dict", None)
    if callable(to_dict):
        dumped = to_dict()
        return dumped if isinstance(dumped, dict) else None

    if hasattr(value, "__dict__"):
        return {
            key: item
            for key, item in vars(value).items()
            if not str(key).startswith("_")
        }

    return None


def _serialize_page_class_plan(page_class_plan: Any) -> Optional[list[dict]]:
    if not page_class_plan:
        return None
    if not isinstance(page_class_plan, list):
        logger.warning(
            "Unexpected page_class_plan type: %s",
            type(page_class_plan).__name__,
        )
        return None

    serialized_items: list[dict] = []
    for item in page_class_plan:
        serialized = _serialize_model_like(item)
        if serialized is None:
            logger.warning(
                "Skipping unsupported page_class_plan item type: %s",
                type(item).__name__,
            )
            continue
        serialized_items.append(serialized)

    return serialized_items or None


class GenerationService:
    """
    课件生成服务 - 高内聚、低耦合

    使用 Marp CLI 和 Pandoc 将 Markdown 转换为文件
    """

    def __init__(
        self,
        output_dir: str | None = None,
        template_service: Optional[TemplateService] = None,
    ):
        self.output_dir = Path(output_dir) if output_dir else get_generated_dir()
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.template_service = template_service or TemplateService()
        logger.info(f"GenerationService initialized with output_dir: {self.output_dir}")

        # 检测工具是否安装
        check_tools_installed()

    async def generate_pptx(
        self,
        content: CoursewareContent,
        task_id: str,
        template_config: Optional[TemplateConfig] = None,
    ) -> str:
        """
        生成 PPTX 文件（使用 Marp CLI）

        Args:
            content: 课件内容（包含 Markdown）
            task_id: 任务ID（用于文件命名和日志）
            template_config: 模板配置（可选）

        Returns:
            str: 生成的文件路径

        Raises:
            ToolNotFoundError: 工具未安装
            ToolExecutionError: 工具执行失败
            FileSystemError: 文件系统错误
            GenerationTimeoutError: 执行超时
        """
        if template_config is None:
            template_config = TemplateConfig()

        # 优先使用 render_markdown，无则回退模板包装
        if content.render_markdown:
            logger.debug(f"[Task: {task_id}] Using render_markdown directly")
            # 防御性清理：去除可能的外层 fence
            from services.courseware_ai.parsing import strip_outer_code_fence

            full_markdown = strip_outer_code_fence(content.render_markdown)
        else:
            logger.debug(
                f"[Task: {task_id}] Fallback to template wrapping: "
                f"{template_config.style}"
            )
            full_markdown = self.template_service.wrap_markdown_with_template(
                markdown_content=content.markdown_content,
                config=template_config,
                title=content.title,
                style_manifest=_serialize_model_like(content.style_manifest),
                extra_css=content.extra_css,
                page_class_plan=_serialize_page_class_plan(content.page_class_plan),
            )

        # 预处理 Mermaid 代码块
        from services.mermaid_renderer import preprocess_mermaid_blocks

        fail_on_unrendered = _should_fail_on_unrendered_mermaid()
        logger.info(
            "[Task: %s] Preprocessing Mermaid blocks (strict=%s)",
            task_id,
            fail_on_unrendered,
        )
        full_markdown = await preprocess_mermaid_blocks(
            full_markdown,
            fail_on_unrendered=fail_on_unrendered,
            asset_dir=self.output_dir,
            asset_prefix=f"{task_id}_mermaid",
        )
        full_markdown = _inject_mermaid_fit_css(full_markdown)
        logger.info(f"[Task: {task_id}] Mermaid preprocessing completed")

        # 调用生成器
        return await _generate_pptx(content, task_id, self.output_dir, full_markdown)

    async def generate_slide_images(
        self,
        content: CoursewareContent,
        task_id: str,
        template_config: Optional[TemplateConfig] = None,
    ) -> list[str]:
        if template_config is None:
            template_config = TemplateConfig()

        # 优先使用 render_markdown，无则回退模板包装
        if content.render_markdown:
            # 防御性清理：去除可能的外层 fence
            from services.courseware_ai.parsing import strip_outer_code_fence

            full_markdown = strip_outer_code_fence(content.render_markdown)
        else:
            full_markdown = self.template_service.wrap_markdown_with_template(
                markdown_content=content.markdown_content,
                config=template_config,
                title=content.title,
                style_manifest=_serialize_model_like(content.style_manifest),
                extra_css=content.extra_css,
                page_class_plan=_serialize_page_class_plan(content.page_class_plan),
            )

        # 预处理 Mermaid 代码块
        from services.mermaid_renderer import preprocess_mermaid_blocks

        fail_on_unrendered = _should_fail_on_unrendered_mermaid()
        logger.info(
            "[Task: %s] Preprocessing Mermaid blocks (strict=%s)",
            task_id,
            fail_on_unrendered,
        )
        full_markdown = await preprocess_mermaid_blocks(
            full_markdown,
            fail_on_unrendered=fail_on_unrendered,
            asset_dir=self.output_dir,
            asset_prefix=f"{task_id}_mermaid",
        )
        full_markdown = _inject_mermaid_fit_css(full_markdown)
        logger.info(f"[Task: {task_id}] Mermaid preprocessing completed")

        return await _generate_slide_images(task_id, self.output_dir, full_markdown)

    async def generate_docx(
        self,
        content: CoursewareContent,
        task_id: str,
        template_config: Optional[TemplateConfig] = None,
    ) -> str:
        """
        生成 Word 教案文件（使用 Pandoc）

        Args:
            content: 课件内容（包含教案 Markdown）
            task_id: 任务ID
            template_config: 模板配置（可选）

        Returns:
            str: 生成的文件路径

        Raises:
            ToolNotFoundError: 工具未安装
            ToolExecutionError: 工具执行失败
            FileSystemError: 文件系统错误
            GenerationTimeoutError: 执行超时
        """
        # 获取 Pandoc 模板路径（如果有）
        if template_config is None:
            template_config = TemplateConfig()

        template_path = self.template_service.get_pandoc_template_path(template_config)
        reference_doc = Path(template_path) if template_path else None

        # 调用生成器
        return await _generate_docx(content, task_id, self.output_dir, reference_doc)


# 全局服务实例
generation_service = GenerationService()

# 导出
__all__ = ["GenerationService", "CoursewareContent", "generation_service"]
