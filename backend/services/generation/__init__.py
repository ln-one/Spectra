"""
课件生成服务主模块。

负责将 AI 生成的 Markdown 内容转换为 PPTX / DOCX。
技术栈：Marp CLI（Markdown -> PPTX）+ Pandoc（Markdown -> DOCX）。
"""

import logging
import os
import re
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional

try:
    from ..runtime_paths import get_generated_dir
    from ..template import TemplateConfig, TemplateService
    from .marp_document import normalize_marp_markdown, split_marp_document
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
    from services.generation.marp_document import (
        normalize_marp_markdown,
        split_marp_document,
    )
    from services.generation.pandoc_generator import generate_docx as _generate_docx
    from services.generation.tool_checker import check_tools_installed
    from services.generation.types import CoursewareContent
    from services.runtime_paths import get_generated_dir
    from services.template import TemplateConfig, TemplateService

logger = logging.getLogger(__name__)

_RUNTIME_LAYOUT_GUARD_MARKER = "spectra-runtime-layout-guard"
_CLASS_COMMENT_RE = re.compile(r"<!--\s*_class:\s*([^>]+?)\s*-->", re.IGNORECASE)
_BULLET_LINE_RE = re.compile(r"^\s*(?:[-*+]\s+|\d+\.\s+)")

_RUNTIME_LAYOUT_GUARD_CSS = """
<style>
/* spectra-runtime-layout-guard */
section {{
  overflow: hidden;
}}

/* Tighten typography spacing to reduce overflow risk */
section p,
section li,
section blockquote,
section td,
section th {{
  line-height: 1.32 !important;
}}

section ul,
section ol {{
  margin: 0.4em 0 0.2em 1.1em !important;
  padding-left: 0.2em !important;
}}

section li {{
  margin: 0.16em 0 !important;
}}

section.density-dense {{
  font-size: 0.88em !important;
}}

/* TOC overflow guard */
section.toc {{
  font-size: 0.92em !important;
}}

section.toc h1 {{
  margin-bottom: 0.45em !important;
}}

section.toc.toc-columns ul,
section.toc.toc-columns ol {{
  columns: 2;
  column-gap: 40px;
}}

section.toc.toc-columns li {{
  break-inside: avoid;
}}

/* Generic image fit guard */
section img {{
  display: block;
  margin: 10px auto !important;
  max-width: 92% !important;
  max-height: min(40vh, 300px) !important;
  width: auto !important;
  height: auto !important;
  object-fit: contain;
}}

section.density-sparse img {{
  max-height: min(44vh, 340px) !important;
}}

section.density-medium img {{
  max-height: min(36vh, 280px) !important;
}}

section.density-dense img {{
  max-height: min(28vh, 220px) !important;
}}

/* Enforced Mermaid image fit rules */
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


def _slide_metrics(slide: str) -> dict[str, int]:
    lines = [line.strip() for line in slide.splitlines() if line.strip()]
    content_lines = [line for line in lines if not line.startswith("<!-- _class:")]
    bullet_count = sum(1 for line in content_lines if _BULLET_LINE_RE.match(line))
    image_count = slide.count("![")
    return {
        "line_count": len(content_lines),
        "bullet_count": bullet_count,
        "image_count": image_count,
    }


def _is_toc_slide(slide: str, class_tokens: list[str]) -> bool:
    if "toc" in class_tokens:
        return True
    return bool(re.search(r"(?m)^\s*#\s*(目录|contents?)\s*$", slide, re.IGNORECASE))


def _upsert_slide_class(
    slide: str,
    *,
    force_density: Optional[str] = None,
    add_tokens: Optional[list[str]] = None,
) -> str:
    add_tokens = [token for token in (add_tokens or []) if token]
    class_match = _CLASS_COMMENT_RE.search(slide)
    existing_tokens: list[str] = []
    if class_match:
        existing_tokens = [token.strip() for token in class_match.group(1).split()]

    page_type = next(
        (token for token in existing_tokens if token in {"cover", "toc", "content"}),
        "content",
    )
    density = next(
        (token for token in existing_tokens if token.startswith("density-")),
        "density-medium",
    )
    if force_density:
        density = force_density

    merged_tokens: list[str] = [
        token
        for token in existing_tokens
        if token not in {"cover", "toc", "content"} and not token.startswith("density-")
    ]
    for token in add_tokens:
        if token not in merged_tokens:
            merged_tokens.append(token)

    class_line = (
        "<!-- _class: " + " ".join([page_type, density, *merged_tokens]) + " -->"
    )
    if class_match:
        return (
            slide[: class_match.start()] + class_line + slide[class_match.end() :]
        ).strip()
    return f"{class_line}\n\n{slide.strip()}"


def _apply_layout_overflow_guards(markdown: str) -> str:
    frontmatter, style_blocks, slides = split_marp_document(markdown)
    if not slides:
        return markdown

    adjusted_slides: list[str] = []
    adjusted_any = False

    for slide in slides:
        class_match = _CLASS_COMMENT_RE.search(slide)
        class_tokens = (
            [token.strip() for token in class_match.group(1).split()]
            if class_match
            else []
        )
        metrics = _slide_metrics(slide)
        is_toc = _is_toc_slide(slide, class_tokens)
        needs_dense = (
            metrics["bullet_count"] >= 8
            or metrics["line_count"] >= 14
            or (metrics["image_count"] > 0 and metrics["line_count"] >= 10)
        )
        add_tokens: list[str] = []
        if is_toc and metrics["bullet_count"] >= 8:
            add_tokens.append("toc-columns")

        updated_slide = slide
        if needs_dense or add_tokens:
            updated_slide = _upsert_slide_class(
                slide,
                force_density="density-dense" if needs_dense else None,
                add_tokens=add_tokens,
            )
            adjusted_any = adjusted_any or (updated_slide != slide)
        adjusted_slides.append(updated_slide)

    if not adjusted_any:
        return markdown

    parts: list[str] = []
    if frontmatter.strip():
        parts.append(frontmatter.strip())
    first_slide = adjusted_slides[0].strip()
    if style_blocks.strip():
        first_slide = f"{style_blocks.strip()}\n\n{first_slide}"
    parts.append(first_slide)
    parts.extend(slide.strip() for slide in adjusted_slides[1:] if slide.strip())
    return "\n\n---\n\n".join(parts).strip() + "\n"


def _inject_runtime_layout_guard_css(markdown: str) -> str:
    """
    Ensure runtime layout guard CSS is always present in final Marp document.

    This is a runtime guard independent from prompt/model output.
    """
    if _RUNTIME_LAYOUT_GUARD_MARKER in markdown:
        return markdown

    style_close = "</style>"
    index = markdown.find(style_close)
    if index != -1:
        insert_pos = index + len(style_close)
        return (
            markdown[:insert_pos]
            + "\n\n"
            + _RUNTIME_LAYOUT_GUARD_CSS.strip()
            + "\n"
            + markdown[insert_pos:]
        )

    frontmatter_match = re.match(r"^\s*---\s*\n[\s\S]*?\n---\s*\n?", markdown)
    if frontmatter_match:
        insert_pos = frontmatter_match.end()
        return (
            markdown[:insert_pos]
            + "\n"
            + _RUNTIME_LAYOUT_GUARD_CSS.strip()
            + "\n"
            + markdown[insert_pos:]
        )

    return _RUNTIME_LAYOUT_GUARD_CSS.strip() + "\n\n" + markdown


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
    课件生成服务（高内聚、低耦合）。

    使用 Marp CLI 和 Pandoc 将 Markdown 转换为目标文件。
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
        生成 PPTX 文件（使用 Marp CLI）。

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
        full_markdown = normalize_marp_markdown(full_markdown)
        full_markdown = _apply_layout_overflow_guards(full_markdown)
        full_markdown = _inject_runtime_layout_guard_css(full_markdown)
        logger.info(f"[Task: {task_id}] Mermaid preprocessing completed")

        # 调用生成器
        return await _generate_pptx(content, task_id, self.output_dir, full_markdown)

    async def generate_slide_images(
        self,
        content: CoursewareContent,
        task_id: str,
        template_config: Optional[TemplateConfig] = None,
        on_image_generated: Optional[Callable[[int, str], Awaitable[None]]] = None,
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

        if on_image_generated is not None:
            logger.info(
                "[Task: %s] Streaming preview uses per-slide Mermaid preprocessing (strict=%s)",
                task_id,
                fail_on_unrendered,
            )

            async def _transform_slide_markdown(
                page_index: int, slide_document: str
            ) -> str:
                transformed = await preprocess_mermaid_blocks(
                    slide_document,
                    fail_on_unrendered=fail_on_unrendered,
                    asset_dir=self.output_dir,
                    asset_prefix=f"{task_id}_mermaid_slide_{page_index + 1:03d}",
                )
                transformed = normalize_marp_markdown(transformed)
                transformed = _apply_layout_overflow_guards(transformed)
                return _inject_runtime_layout_guard_css(transformed)

            return await _generate_slide_images(
                task_id,
                self.output_dir,
                full_markdown,
                on_image_generated=on_image_generated,
                transform_slide_markdown=_transform_slide_markdown,
            )

        full_markdown = await preprocess_mermaid_blocks(
            full_markdown,
            fail_on_unrendered=fail_on_unrendered,
            asset_dir=self.output_dir,
            asset_prefix=f"{task_id}_mermaid",
        )
        full_markdown = normalize_marp_markdown(full_markdown)
        full_markdown = _apply_layout_overflow_guards(full_markdown)
        full_markdown = _inject_runtime_layout_guard_css(full_markdown)
        logger.info(f"[Task: {task_id}] Mermaid preprocessing completed")

        return await _generate_slide_images(
            task_id,
            self.output_dir,
            full_markdown,
            on_image_generated=on_image_generated,
        )

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
        if template_config is None:
            template_config = TemplateConfig()

        template_path = self.template_service.get_pandoc_template_path(template_config)
        reference_doc = Path(template_path) if template_path else None

        return await _generate_docx(content, task_id, self.output_dir, reference_doc)


# 全局服务实例
generation_service = GenerationService()

# 导出
__all__ = ["GenerationService", "CoursewareContent", "generation_service"]
