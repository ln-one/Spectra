"""
璇句欢鐢熸垚鏈嶅姟 - 涓绘湇鍔＄被

璐熻矗灏?AI 鐢熸垚鐨?Markdown 鍐呭杞崲涓?PPT 鍜?Word 鏂囦欢
鎶€鏈爤锛歁arp CLI (Markdown 鈫?PPTX) + Pandoc (Markdown 鈫?DOCX)

璁捐鍘熷垯锛?
- 楂樺唴鑱氾細鍙礋璐ｆ枃浠剁敓鎴愶紝涓嶆秹鍙婃暟鎹簱/璁よ瘉
- 浣庤€﹀悎锛氳緭鍏ユ槸 Markdown 瀛楃涓诧紝鍙敤 Mock 鏁版嵁鐙珛娴嬭瘯
- 鎺ュ彛濂戠害锛氫笌鎴愬憳 D 鐨?AI 鏈嶅姟绾﹀畾 Markdown 鏍煎紡
"""

import logging
import os
import re
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional

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
    璇句欢鐢熸垚鏈嶅姟 - 楂樺唴鑱氥€佷綆鑰﹀悎

    浣跨敤 Marp CLI 鍜?Pandoc 灏?Markdown 杞崲涓烘枃浠?
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

        # 妫€娴嬪伐鍏锋槸鍚﹀畨瑁?
        check_tools_installed()

    async def generate_pptx(
        self,
        content: CoursewareContent,
        task_id: str,
        template_config: Optional[TemplateConfig] = None,
    ) -> str:
        """
        鐢熸垚 PPTX 鏂囦欢锛堜娇鐢?Marp CLI锛?

        Args:
            content: 璇句欢鍐呭锛堝寘鍚?Markdown锛?
            task_id: 浠诲姟ID锛堢敤浜庢枃浠跺懡鍚嶅拰鏃ュ織锛?
            template_config: 妯℃澘閰嶇疆锛堝彲閫夛級

        Returns:
            str: 鐢熸垚鐨勬枃浠惰矾寰?

        Raises:
            ToolNotFoundError: 宸ュ叿鏈畨瑁?
            ToolExecutionError: 宸ュ叿鎵ц澶辫触
            FileSystemError: 鏂囦欢绯荤粺閿欒
            GenerationTimeoutError: 鎵ц瓒呮椂
        """
        if template_config is None:
            template_config = TemplateConfig()

        # 浼樺厛浣跨敤 render_markdown锛屾棤鍒欏洖閫€妯℃澘鍖呰
        if content.render_markdown:
            logger.debug(f"[Task: {task_id}] Using render_markdown directly")
            # 闃插尽鎬ф竻鐞嗭細鍘婚櫎鍙兘鐨勫灞?fence
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

        # 棰勫鐞?Mermaid 浠ｇ爜鍧?
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

        # 璋冪敤鐢熸垚鍣?
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

        # 浼樺厛浣跨敤 render_markdown锛屾棤鍒欏洖閫€妯℃澘鍖呰
        if content.render_markdown:
            # 闃插尽鎬ф竻鐞嗭細鍘婚櫎鍙兘鐨勫灞?fence
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

        # 棰勫鐞?Mermaid 浠ｇ爜鍧?
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
                return _inject_mermaid_fit_css(transformed)

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
        full_markdown = _inject_mermaid_fit_css(full_markdown)
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


# 鍏ㄥ眬鏈嶅姟瀹炰緥
generation_service = GenerationService()

# 瀵煎嚭
__all__ = ["GenerationService", "CoursewareContent", "generation_service"]

