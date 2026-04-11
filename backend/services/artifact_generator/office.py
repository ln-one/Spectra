import logging
from pathlib import Path
from typing import Any, Dict
from uuid import uuid4

logger = logging.getLogger(__name__)


class ArtifactOfficeMixin:
    @staticmethod
    def _build_marp_markdown(content: Dict[str, Any], title: str) -> str:
        raw_markdown = str(content.get("markdown_content") or "").strip()
        if raw_markdown:
            return raw_markdown

        slides = content.get("slides")
        slide_items = slides if isinstance(slides, list) else []
        if not slide_items:
            slide_items = [{"title": title, "content": content.get("summary", "")}]

        blocks: list[str] = [
            "---",
            "marp: true",
            "theme: default",
            "paginate: true",
            "---",
        ]
        for item in slide_items:
            slide_title = str(item.get("title") or title).strip()
            slide_content = str(
                item.get("content")
                or item.get("description")
                or item.get("summary")
                or ""
            ).strip()
            blocks.append(f"# {slide_title or title}")
            if slide_content:
                blocks.append(slide_content)
            blocks.append("---")
        return "\n\n".join(blocks).rstrip("- \n")

    @staticmethod
    def _build_doc_markdown(content: Dict[str, Any], title: str) -> str:
        lesson_plan_markdown = str(content.get("lesson_plan_markdown") or "").strip()
        if lesson_plan_markdown:
            return lesson_plan_markdown

        lines: list[str] = [f"# {title}"]
        summary = str(content.get("summary") or "").strip()
        if summary:
            lines.extend(["", summary])

        sections = content.get("sections")
        section_items = sections if isinstance(sections, list) else []
        for section in section_items:
            section_title = str(section.get("title") or "").strip()
            section_content = str(
                section.get("content")
                or section.get("description")
                or section.get("summary")
                or ""
            ).strip()
            if section_title:
                lines.extend(["", f"## {section_title}"])
            if section_content:
                lines.extend(["", section_content])
        return "\n".join(lines).strip()

    async def _render_pptx_with_marp(self, storage_path: str, markdown: str) -> None:
        try:
            from services.generation.marp_generator import call_marp_cli
        except Exception as exc:  # pragma: no cover - env-dependent import
            raise RuntimeError("marp_renderer_unavailable") from exc

        output_path = Path(storage_path)
        temp_md = output_path.with_name(f".tmp-{uuid4().hex}.md")
        temp_md.write_text(markdown, encoding="utf-8")
        try:
            await call_marp_cli(temp_md, output_path)
        except Exception as exc:
            raise RuntimeError("marp_render_failed") from exc
        finally:
            temp_md.unlink(missing_ok=True)

        if not output_path.exists() or output_path.stat().st_size <= 0:
            raise RuntimeError("marp_render_missing_output")

    async def _render_docx_with_pandoc(self, storage_path: str, markdown: str) -> None:
        try:
            from services.generation.pandoc_generator import call_pandoc
        except Exception as exc:  # pragma: no cover - env-dependent import
            raise RuntimeError("pandoc_renderer_unavailable") from exc

        output_path = Path(storage_path)
        temp_md = output_path.with_name(f".tmp-{uuid4().hex}.md")
        temp_md.write_text(markdown, encoding="utf-8")
        try:
            await call_pandoc(temp_md, output_path)
        except Exception as exc:
            raise RuntimeError("pandoc_render_failed") from exc
        finally:
            temp_md.unlink(missing_ok=True)

        if not output_path.exists() or output_path.stat().st_size <= 0:
            raise RuntimeError("pandoc_render_missing_output")

    async def generate_pptx(
        self, content: Dict[str, Any], project_id: str, artifact_id: str
    ) -> str:
        storage_path = self.get_storage_path(project_id, "pptx", artifact_id)
        title = str(content.get("title", "Project Space PPTX")).strip()
        markdown = self._build_marp_markdown(content, title)
        await self._render_pptx_with_marp(storage_path, markdown)
        logger.info("Generated PPTX artifact via Marp at %s", storage_path)
        return storage_path

    async def generate_docx(
        self, content: Dict[str, Any], project_id: str, artifact_id: str
    ) -> str:
        storage_path = self.get_storage_path(project_id, "docx", artifact_id)
        title = str(content.get("title", "Project Space DOCX")).strip()
        markdown = self._build_doc_markdown(content, title)
        await self._render_docx_with_pandoc(storage_path, markdown)
        logger.info("Generated DOCX artifact via Pandoc at %s", storage_path)
        return storage_path
