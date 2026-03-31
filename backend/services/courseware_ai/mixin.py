"""课件生成相关的 mixin 入口。"""

from typing import Optional

from schemas.generation import CoursewareContent
from schemas.outline import CoursewareOutline
from services.courseware_ai.generation import (
    ALLOW_COURSEWARE_FALLBACK,
    extract_structured_content,
    generate_courseware_content,
    merge_requirements_with_outline,
    modify_courseware,
)
from services.courseware_ai.outline import generate_outline
from services.courseware_ai.outline_fallbacks import get_fallback_outline
from services.courseware_ai.parsing import (
    enforce_outline_structure,
    extract_block,
    extract_frontmatter,
    get_fallback_courseware,
    heuristic_split_sections,
    normalize_slide_with_outline,
    parse_courseware_response,
    parse_marp_slides,
    reassemble_marp,
    sanitize_marker_lines,
    sanitize_ppt_markdown,
    strip_outer_code_fence,
)


class CoursewareAIMixin:
    """供 ``AIService`` 复用的课件生成能力集合。"""

    async def generate_outline(
        self,
        project_id: str,
        user_requirements: str,
        template_style: str = "default",
        session_id: Optional[str] = None,
        rag_source_ids: Optional[list[str]] = None,
    ) -> CoursewareOutline:
        return await generate_outline(
            self,
            project_id,
            user_requirements,
            template_style,
            session_id,
            rag_source_ids,
        )

    @staticmethod
    def _get_fallback_outline(user_requirements: str) -> CoursewareOutline:
        return get_fallback_outline(user_requirements)

    @staticmethod
    def parse_marp_slides(markdown_content: str) -> list[dict]:
        return parse_marp_slides(markdown_content)

    @staticmethod
    def _reassemble_marp(frontmatter: str, slides: list[str]) -> str:
        return reassemble_marp(frontmatter, slides)

    @staticmethod
    def _extract_frontmatter(markdown_content: str) -> str:
        return extract_frontmatter(markdown_content)

    async def modify_courseware(
        self,
        current_content: str,
        instruction: str,
        target_slides: Optional[list[int]] = None,
        rag_context: Optional[list[dict]] = None,
        strict_source_mode: bool = False,
    ) -> CoursewareContent:
        return await modify_courseware(
            self,
            current_content,
            instruction,
            target_slides,
            rag_context,
            strict_source_mode,
        )

    async def extract_structured_content(
        self,
        project_id: str,
        user_requirements: str,
        template_style: str = "default",
        outline: Optional[CoursewareOutline] = None,
        session_id: Optional[str] = None,
        rag_source_ids: Optional[list[str]] = None,
    ) -> CoursewareContent:
        return await extract_structured_content(
            self,
            project_id,
            user_requirements,
            template_style,
            outline,
            session_id,
            rag_source_ids,
        )

    async def generate_courseware_content(
        self,
        project_id: str,
        user_requirements: Optional[str] = None,
        template_style: str = "default",
        outline_document: Optional[dict] = None,
        outline_version: Optional[int] = None,
        session_id: Optional[str] = None,
        rag_source_ids: Optional[list[str]] = None,
    ) -> CoursewareContent:
        return await generate_courseware_content(
            self,
            project_id,
            user_requirements,
            template_style,
            outline_document,
            outline_version,
            session_id,
            rag_source_ids,
        )

    @staticmethod
    def _merge_requirements_with_outline(
        user_requirements: str,
        outline_document: dict,
    ) -> str:
        return merge_requirements_with_outline(user_requirements, outline_document)

    def _parse_courseware_response(
        self,
        content: str,
        user_requirements: str,
    ) -> CoursewareContent:
        return parse_courseware_response(self, content, user_requirements)

    @staticmethod
    def _strip_outer_code_fence(content: str) -> str:
        return strip_outer_code_fence(content)

    @staticmethod
    def _extract_block(content: str, start_tag: str, end_tag: str) -> str:
        return extract_block(content, start_tag, end_tag)

    @staticmethod
    def _sanitize_marker_lines(content: str) -> str:
        return sanitize_marker_lines(content)

    @staticmethod
    def _sanitize_ppt_markdown(content: str) -> str:
        return sanitize_ppt_markdown(content)

    def _enforce_outline_structure(
        self,
        markdown_content: str,
        outline_document: dict,
    ) -> str:
        return enforce_outline_structure(markdown_content, outline_document)

    @staticmethod
    def _normalize_slide_with_outline(
        content: str,
        expected_title: str,
        key_points: list[str],
    ) -> str:
        return normalize_slide_with_outline(content, expected_title, key_points)

    @staticmethod
    def _heuristic_split_sections(content: str) -> tuple[str, str]:
        return heuristic_split_sections(content)

    def _get_fallback_courseware(self, user_requirements: str) -> CoursewareContent:
        return get_fallback_courseware(user_requirements)


__all__ = ["ALLOW_COURSEWARE_FALLBACK", "CoursewareAIMixin"]
