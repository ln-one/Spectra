"""
Courseware AI - 璇句欢鐢熸垚鐩稿叧 AI 鏂规硶

浠?ai.py 鎷嗗垎锛屽寘鍚ぇ绾茬敓鎴愩€佺粨鏋勫寲鍐呭鎻愬彇銆佽浠剁敓鎴愩€佽В鏋愬拰 fallback銆?
AIService 閫氳繃 mixin 缁ф壙杩欎簺鏂规硶銆?
"""

import json
import logging
import os
import re
from typing import TYPE_CHECKING, Optional

from schemas.generation import CoursewareContent
from schemas.outline import CoursewareOutline, OutlineSection
from services.model_router import ModelRouteTask

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)
# 鏄惁鍏佽璇句欢鐢熸垚澶辫触鏃朵娇鐢ㄦā鏉垮寲 fallback 鍐呭锛堥粯璁?false锛岀敓浜у缓璁繚鎸?false锛?
ALLOW_COURSEWARE_FALLBACK = (
    os.getenv("ALLOW_COURSEWARE_FALLBACK", "false").lower() == "true"
)


class CoursewareAIMixin:
    """璇句欢鐢熸垚鐩稿叧鏂规硶锛岀敱 AIService 缁ф壙"""

    async def generate_outline(
        self,
        project_id: str,
        user_requirements: str,
        template_style: str = "default",
    ) -> CoursewareOutline:
        """
        鐢熸垚璇句欢缁撴瀯鍖栧ぇ绾诧紝渚涚敤鎴风‘璁?璋冩暣鍚庡啀鐢熸垚瀹屾暣璇句欢
        """
        from services.prompt_service import STYLE_REQUIREMENTS, _format_rag_context

        rag_context = await self._retrieve_rag_context(project_id, user_requirements)

        rag_hint = ""
        if rag_context:
            rag_hint = (
                "\n\n浠ヤ笅鏄粠鐢ㄦ埛涓婁紶璧勬枡涓绱㈠埌鐨勫弬鑰冨唴瀹癸紝"
                "璇锋嵁姝や紭鍖栧ぇ绾诧細\n" + _format_rag_context(rag_context)
            )

        style_desc = STYLE_REQUIREMENTS.get(
            template_style, STYLE_REQUIREMENTS["default"]
        )

        prompt = f"""你是资深学科教学设计师。
请基于以下需求生成结构化课件大纲。
{rag_hint}
参考内容请结合用户资料合理吸收。
教学需求：{user_requirements}
模板风格：{template_style} - {style_desc}

仅返回 JSON：
{{
  "title": "课件标题",
  "sections": [
    {{"title": "章节标题", "key_points": ["要点A", "要点B"], "slide_count": 2}}
  ],
  "summary": "一句话总结"
}}

约束：
1. 章节数 3-8，完整覆盖教学流程（导入 -> 讲授 -> 练习 -> 总结）。
2. 每章 2-5 个关键要点。
3. 总页数通常控制在 10-20 页。
"""
        try:
            response = await self.generate(
                prompt=prompt,
                route_task=ModelRouteTask.OUTLINE_FORMATTING.value,
                has_rag_context=bool(rag_context),
                max_tokens=1500,
            )
            content = response["content"].strip()

            json_match = re.search(r"\{[\s\S]*\}", content)
            if not json_match:
                raise ValueError("No JSON found in response")

            parsed = json.loads(json_match.group())
            sections = [OutlineSection(**s) for s in parsed.get("sections", [])]
            if not sections:
                raise ValueError("LLM returned empty sections list")
            # +2 accounts for the title slide and summary/closing slide
            total = sum(s.slide_count for s in sections) + 2

            return CoursewareOutline(
                title=parsed.get("title", user_requirements[:50]),
                sections=sections,
                total_slides=total,
                summary=parsed.get("summary"),
            )
        except Exception as e:
            logger.warning(f"Outline generation failed: {e}, using fallback")
            return self._get_fallback_outline(user_requirements)

    @staticmethod
    def _get_fallback_outline(user_requirements: str) -> CoursewareOutline:
        """Fallback outline when outline generation fails."""
        return CoursewareOutline(
            title=user_requirements[:50],
            sections=[
                OutlineSection(
                    title="导入",
                    key_points=["主题引入", "学习动机"],
                    slide_count=2,
                ),
                OutlineSection(
                    title="核心概念",
                    key_points=["关键概念", "示例讲解"],
                    slide_count=5,
                ),
                OutlineSection(
                    title="练习与讨论",
                    key_points=["课堂练习", "小组讨论"],
                    slide_count=3,
                ),
                OutlineSection(
                    title="总结",
                    key_points=["要点回顾", "作业布置"],
                    slide_count=2,
                ),
            ],
            total_slides=14,
            summary="基础教学大纲",
        )

    @staticmethod
    def parse_marp_slides(markdown_content: str) -> list[dict]:
        """
        灏?Marp Markdown 鎷嗗垎涓虹嫭绔嬪够鐏墖鍒楄〃

        Returns:
            [{"index": 0, "title": "...", "content": "..."}, ...]
        """
        content = CoursewareAIMixin._sanitize_ppt_markdown(markdown_content).strip()
        # 鍘绘帀 frontmatter
        fm_match = re.match(r"^---\s*\n[\s\S]*?\n---\s*\n?", content)
        if fm_match:
            content = content[fm_match.end() :]

        raw_slides = re.split(r"\n---\s*\n", content)
        slides = []
        for i, raw in enumerate(raw_slides):
            raw = raw.strip()
            if not raw:
                continue
            title_match = re.match(r"^#\s+(.+)$", raw, re.MULTILINE)
            title = title_match.group(1).strip() if title_match else ""
            slides.append({"index": i, "title": title, "content": raw})
        return slides

    @staticmethod
    def _reassemble_marp(frontmatter: str, slides: list[str]) -> str:
        """灏?frontmatter 鍜?slide 鍐呭鍒楄〃閲嶆柊缁勮涓?Marp Markdown"""
        parts = [frontmatter.strip()] if frontmatter.strip() else []
        parts.extend(s.strip() for s in slides if s.strip())
        return "\n\n---\n\n".join(parts) + "\n"

    @staticmethod
    def _extract_frontmatter(markdown_content: str) -> str:
        """鎻愬彇 Marp frontmatter 閮ㄥ垎"""
        fm_match = re.match(r"^(---\s*\n[\s\S]*?\n---)\s*\n?", markdown_content)
        return fm_match.group(1) if fm_match else ""

    async def modify_courseware(
        self,
        current_content: str,
        instruction: str,
        target_slides: Optional[list[int]] = None,
    ) -> CoursewareContent:
        """
        宸紓鍖栦慨鏀硅浠跺唴瀹?

        浠呴噸鏂扮敓鎴愮洰鏍?slides锛屼繚鎸佸叾浣欎笉鍙樸€?
        鏃犵洰鏍?slides 鏃跺鍏ㄦ枃璋冪敤 LLM 淇敼銆?
        """
        from services.prompt_service import prompt_service

        frontmatter = self._extract_frontmatter(current_content)
        all_slides = self.parse_marp_slides(current_content)

        if target_slides and all_slides:
            target_indices = [s - 1 for s in target_slides if 1 <= s <= len(all_slides)]
            if not target_indices:
                target_indices = list(range(len(all_slides)))

            target_content = "\n\n---\n\n".join(
                all_slides[i]["content"] for i in target_indices
            )
            target_labels = [str(i + 1) for i in target_indices]
            prompt = prompt_service.build_modify_prompt(
                current_content=target_content,
                instruction=instruction,
                target_slides=target_labels,
            )
            response = await self.generate(
                prompt=prompt,
                route_task=ModelRouteTask.PREVIEW_MODIFICATION.value,
                max_tokens=3000,
            )
            modified_raw = self._strip_outer_code_fence(response["content"])
            modified_parts = re.split(r"\n---\s*\n", modified_raw)

            if len(modified_parts) != len(target_indices):
                logger.warning(
                    "modify_courseware: LLM returned %d sections for %d targets, "
                    "falling back to full-document regeneration.",
                    len(modified_parts),
                    len(target_indices),
                )
                prompt = prompt_service.build_modify_prompt(
                    current_content=current_content,
                    instruction=instruction,
                )
                response = await self.generate(
                    prompt=prompt,
                    route_task=ModelRouteTask.PREVIEW_MODIFICATION.value,
                    max_tokens=4000,
                )
                new_markdown = self._strip_outer_code_fence(response["content"])
            else:
                slide_contents = [s["content"] for s in all_slides]
                for idx, new_part in zip(target_indices, modified_parts):
                    slide_contents[idx] = new_part.strip()

                new_markdown = self._reassemble_marp(frontmatter, slide_contents)
        else:
            prompt = prompt_service.build_modify_prompt(
                current_content=current_content,
                instruction=instruction,
            )
            response = await self.generate(
                prompt=prompt,
                route_task=ModelRouteTask.PREVIEW_MODIFICATION.value,
                max_tokens=4000,
            )
            new_markdown = self._strip_outer_code_fence(response["content"])

        return self._parse_courseware_response(new_markdown, instruction[:50])

    async def extract_structured_content(
        self,
        project_id: str,
        user_requirements: str,
        template_style: str = "default",
        outline: Optional[CoursewareOutline] = None,
    ) -> CoursewareContent:
        """
        浠?RAG 妫€绱㈢粨鏋滀腑鎻愬彇缁撴瀯鍖栨暀瀛﹀唴瀹癸紝鐢熸垚 CoursewareContent

        鍏堢敓鎴愬ぇ绾诧紝鍐嶆寜澶х翰閫愮珷鑺傜敓鎴愬唴瀹癸紝閫傚悎鏈変笂浼犺祫鏂欑殑鍦烘櫙銆?
        """
        from services.prompt_service import prompt_service

        if not outline:
            outline = await self.generate_outline(
                project_id, user_requirements, template_style
            )

        rag_context = await self._retrieve_rag_context(
            project_id, user_requirements, top_k=8
        )

        outline_guide = "\n".join(
            f"- {s.title} ({s.slide_count} slides): {', '.join(s.key_points)}"
            for s in outline.sections
        )
        enhanced_req = (
            f"{user_requirements}\n\n"
            f"Please strictly follow this outline structure:\n{outline_guide}"
        )

        prompt = prompt_service.build_courseware_prompt(
            user_requirements=enhanced_req,
            template_style=template_style,
            rag_context=rag_context,
        )

        response = await self.generate(
            prompt=prompt,
            route_task=ModelRouteTask.LESSON_PLAN_REASONING.value,
            has_rag_context=bool(rag_context),
            max_tokens=4000,
        )
        return self._parse_courseware_response(response["content"], outline.title)

    async def generate_courseware_content(
        self,
        project_id: str,
        user_requirements: Optional[str] = None,
        template_style: str = "default",
        outline_document: Optional[dict] = None,
        outline_version: Optional[int] = None,
    ) -> CoursewareContent:
        """
        鐢熸垚璇句欢鍐呭锛圥PT Markdown 鍜屾暀妗?Markdown锛?

        鐢熸垚鍓嶈嚜鍔ㄦ绱?RAG 鐭ヨ瘑搴擄紝灏嗙浉鍏冲唴瀹规敞鍏?prompt銆?
        """
        from services.prompt_service import prompt_service

        try:
            if not user_requirements:
                user_requirements = "閫氱敤鏁欏璇句欢"

            logger.info(
                f"Generating courseware content for project {project_id}",
                extra={
                    "project_id": project_id,
                    "requirements": user_requirements[:100],
                    "template_style": template_style,
                    "outline_version": outline_version,
                },
            )

            outline_nodes = (outline_document or {}).get("nodes") or []
            if outline_document:
                user_requirements = self._merge_requirements_with_outline(
                    user_requirements=user_requirements,
                    outline_document=outline_document,
                )

            rag_context = await self._retrieve_rag_context(
                project_id, user_requirements
            )
            if rag_context:
                logger.info(
                    f"RAG retrieved {len(rag_context)} chunks",
                    extra={"project_id": project_id},
                )

            prompt = prompt_service.build_courseware_prompt(
                user_requirements=user_requirements,
                template_style=template_style,
                rag_context=rag_context,
                outline_mode=bool(outline_nodes),
                outline_slide_count=len(outline_nodes) if outline_nodes else None,
            )

            response = await self.generate(
                prompt=prompt,
                route_task=ModelRouteTask.LESSON_PLAN_REASONING.value,
                has_rag_context=bool(rag_context),
                max_tokens=4000,
            )
            courseware = self._parse_courseware_response(
                response["content"], user_requirements
            )
            if outline_nodes:
                courseware.markdown_content = self._enforce_outline_structure(
                    courseware.markdown_content,
                    outline_document=outline_document or {},
                )

            logger.info(
                "Courseware content generated successfully",
                extra={
                    "project_id": project_id,
                    "title": courseware.title,
                },
            )
            return courseware

        except Exception as e:
            logger.error(
                f"Failed to generate courseware: {e}",
                extra={"project_id": project_id},
                exc_info=True,
            )
            if ALLOW_COURSEWARE_FALLBACK:
                return self._get_fallback_courseware(user_requirements)
            raise

    @staticmethod
    def _merge_requirements_with_outline(
        user_requirements: str,
        outline_document: dict,
    ) -> str:
        nodes = (outline_document or {}).get("nodes") or []
        if not nodes:
            return user_requirements

        sorted_nodes = sorted(nodes, key=lambda item: item.get("order", 0))
        outline_lines = []
        for node in sorted_nodes:
            title = node.get("title", "Untitled Slide")
            points = node.get("key_points") or []
            key_points = " | ".join(str(p) for p in points if p) or "N/A"
            outline_lines.append(
                f"- Slide {node.get('order', '?')}: {title} (key points: {key_points})"
            )

        outline_block = "\n".join(outline_lines)
        return (
            f"{user_requirements}\n\n"
            "Confirmed outline (must follow strictly):\n"
            f"- Exact slide count required: {len(sorted_nodes)}\n"
            "- Do not add extra intro/summary slides unless they exist in outline.\n"
            "- Keep the same slide order and titles as outline.\n"
            f"{outline_block}"
        )

    def _parse_courseware_response(
        self, content: str, user_requirements: str
    ) -> CoursewareContent:
        """Parse courseware content returned by LLM."""
        normalized_content = self._strip_outer_code_fence(content)
        ppt_content = self._extract_block(
            normalized_content, "PPT_CONTENT_START", "PPT_CONTENT_END"
        )
        lesson_plan = self._extract_block(
            normalized_content, "LESSON_PLAN_START", "LESSON_PLAN_END"
        )

        if not ppt_content or not lesson_plan:
            logger.warning("Failed to parse strict markers, trying heuristic split")
            heuristic_ppt, heuristic_lesson = self._heuristic_split_sections(
                normalized_content
            )
            ppt_content = ppt_content or heuristic_ppt
            lesson_plan = lesson_plan or heuristic_lesson

        ppt_content = self._sanitize_ppt_markdown(ppt_content)
        lesson_plan = self._sanitize_marker_lines(lesson_plan)

        title_match = re.search(r"^#\s+(.+)$", ppt_content, re.MULTILINE)
        title = title_match.group(1).strip() if title_match else user_requirements[:50]

        if not ppt_content:
            logger.warning("PPT content is empty, using fallback")
            ppt_content = (
                f"# {title}\n\nCourseware is being prepared...\n\n---\n\n"
                "# Summary\n\nThank you"
            )

        if not lesson_plan:
            logger.warning("Lesson plan is empty, using fallback")
            lesson_plan = (
                f"# 教学目标\n\n- 完成《{title}》教学设计\n"
                f"# 教学过程\n\n## 教学环节\n\n内容待补充"
            )

        return CoursewareContent(
            title=title,
            markdown_content=ppt_content,
            lesson_plan_markdown=lesson_plan,
        )

    @staticmethod
    def _strip_outer_code_fence(content: str) -> str:
        """Strip outer markdown code fence if present."""
        fence_match = re.match(
            r"^\s*```(?:markdown|md)?\s*(.*?)\s*```\s*$",
            content,
            re.DOTALL | re.IGNORECASE,
        )
        if fence_match:
            return fence_match.group(1).strip()
        return content.strip()

    @staticmethod
    def _extract_block(content: str, start_tag: str, end_tag: str) -> str:
        """Extract marker block content with optional '=' wrappers."""
        pattern = (
            rf"(?is)(?:^|\n)\s*(?:=+\s*)?{re.escape(start_tag)}(?:\s*=+)?\s*(?:\n|$)"
            rf"(.*?)"
            rf"(?:^|\n)\s*(?:=+\s*)?{re.escape(end_tag)}(?:\s*=+)?\s*(?:\n|$)"
        )
        match = re.search(pattern, content, re.IGNORECASE)
        return match.group(1).strip() if match else ""

    @staticmethod
    def _sanitize_marker_lines(content: str) -> str:
        if not content:
            return ""
        cleaned = re.sub(
            (
                r"(?im)^\s*(?:=+\s*)?"
                r"(PPT_CONTENT_START|PPT_CONTENT_END|LESSON_PLAN_START|LESSON_PLAN_END)"
                r"(?:\s*=+)?\s*$"
            ),
            "",
            content,
        )
        # Also remove stray inline marker tokens if model leaks them into text.
        cleaned = re.sub(
            (
                r"(?i)(?:=+\s*)?"
                r"(PPT_CONTENT_START|PPT_CONTENT_END|LESSON_PLAN_START|LESSON_PLAN_END)"
                r"(?:\s*=+)?"
            ),
            "",
            cleaned,
        )
        return cleaned.strip()

    @staticmethod
    def _sanitize_ppt_markdown(content: str) -> str:
        cleaned = CoursewareAIMixin._sanitize_marker_lines(content)
        if not cleaned:
            return ""

        cleaned = CoursewareAIMixin._strip_outer_code_fence(cleaned)
        cleaned = CoursewareAIMixin._sanitize_marker_lines(cleaned)

        fm_anywhere = re.search(
            r"---\s*\n[\s\S]*?marp:\s*true[\s\S]*?\n---\s*\n?",
            cleaned,
            re.IGNORECASE,
        )
        if fm_anywhere and fm_anywhere.start() > 0:
            prefix = cleaned[: fm_anywhere.start()].strip()
            if prefix and not re.search(r"(?m)^\s*#\s+", prefix):
                cleaned = cleaned[fm_anywhere.start() :]

        return cleaned.strip()

    def _enforce_outline_structure(
        self,
        markdown_content: str,
        outline_document: dict,
    ) -> str:
        nodes = (outline_document or {}).get("nodes") or []
        if not nodes:
            return self._sanitize_ppt_markdown(markdown_content)

        sorted_nodes = sorted(nodes, key=lambda item: item.get("order", 0))
        sanitized = self._sanitize_ppt_markdown(markdown_content)
        frontmatter = self._extract_frontmatter(sanitized)
        parsed_slides = self.parse_marp_slides(sanitized)

        rebuilt_slides: list[str] = []
        for idx, node in enumerate(sorted_nodes):
            expected_title = str(node.get("title") or f"Slide {idx + 1}").strip()
            key_points = [
                str(point).strip()
                for point in (node.get("key_points") or [])
                if str(point).strip()
            ]
            existing = parsed_slides[idx]["content"] if idx < len(parsed_slides) else ""
            rebuilt_slides.append(
                self._normalize_slide_with_outline(existing, expected_title, key_points)
            )

        return self._reassemble_marp(frontmatter, rebuilt_slides)

    @staticmethod
    def _normalize_slide_with_outline(
        content: str,
        expected_title: str,
        key_points: list[str],
    ) -> str:
        body = (content or "").strip()
        if body:
            if re.search(r"(?m)^\s*#\s+.+$", body):
                body = re.sub(
                    r"(?m)^\s*#\s+.+$",
                    f"# {expected_title}",
                    body,
                    count=1,
                )
            else:
                body = f"# {expected_title}\n\n{body}".strip()
        else:
            body = f"# {expected_title}"

        non_empty_lines = [line for line in body.splitlines() if line.strip()]
        if key_points:
            body_without_title = re.sub(r"(?m)^\s*#\s+.+\n?", "", body, count=1).strip()
            body_lower = body_without_title.lower()
            has_outline_points = any(
                point.lower() in body_lower for point in key_points if point.strip()
            )
            if not has_outline_points:
                bullets = "\n".join(f"- {point}" for point in key_points[:5])
                body = f"# {expected_title}\n\n{bullets}"
                non_empty_lines = [line for line in body.splitlines() if line.strip()]

        if len(non_empty_lines) <= 2 and key_points:
            bullets = "\n".join(f"- {point}" for point in key_points[:5])
            body = f"# {expected_title}\n\n{bullets}"

        if not key_points and len(non_empty_lines) <= 1:
            body = f"# {expected_title}\n\n- 内容待补充"

        return body.strip()

    @staticmethod
    def _heuristic_split_sections(content: str) -> tuple[str, str]:
        """Heuristic split when explicit marker blocks are missing."""
        lesson_heading = re.search(
            r"^\s*#\s*(教学目标|教案|Lesson Plan)\b.*$",
            content,
            re.MULTILINE | re.IGNORECASE,
        )
        if lesson_heading:
            split_idx = lesson_heading.start()
            ppt_part = content[:split_idx].strip()
            lesson_part = content[split_idx:].strip()
            return ppt_part, lesson_part

        if re.search(r"^\s*---\s*\n[\s\S]*?marp:\s*true", content, re.IGNORECASE):
            return content.strip(), ""

        return "", content.strip()

    def _get_fallback_courseware(self, user_requirements: str) -> CoursewareContent:
        """Fallback courseware content when AI generation fails."""
        title = user_requirements[:50] if user_requirements else "课程主题"

        return CoursewareContent(
            title=title,
            markdown_content=(
                f"# {title}\n\n课程导入\n\n---\n\n"
                "# 学习目标\n\n"
                "- 理解核心概念\n"
                "- 掌握基础方法\n"
                "- 能够迁移应用\n\n---\n\n"
                "# 核心内容\n\n"
                "## 关键知识讲解\n\n"
                "内容讲解与示例。\n\n---\n\n"
                "# 课堂练习\n\n分层练习与互动。\n\n---\n\n"
                "# 课堂总结\n\n"
                "- 要点回顾\n"
                "- 作业布置\n"
                "- 下节预告\n"
            ),
            lesson_plan_markdown=(
                f"# 教学目标\n\n"
                f"- 知识目标：理解 {title} 的核心知识\n"
                f"- 能力目标：能够运用相关方法解决问题\n"
                f"- 情感目标：建立学习兴趣与主动性\n\n"
                "# 教学重点\n\n"
                "- 核心概念理解\n"
                "- 方法应用迁移\n\n"
                "# 教学难点\n\n"
                "- 深层理解与举一反三\n"
                "- 情境化应用\n\n"
                "# 教学过程\n\n"
                "## 导入（5分钟）\n\n"
                "创设情境，激发兴趣。\n\n"
                "## 讲授（25分钟）\n\n"
                "讲解核心知识并示例演示。\n\n"
                "## 练习（10分钟）\n\n"
                "分层练习与点评。\n\n"
                "## 总结（5分钟）\n\n"
                "回顾要点并布置作业。\n\n"
                f"# 板书设计\n\n```\n{title}\n"
                "├─ 核心概念\n"
                "├─ 关键方法\n"
                "└─ 应用场景\n```\n\n"
                "# 作业布置\n\n"
                "1. 复习课堂内容\n"
                "2. 完成配套练习\n"
                "3. 预习下一课\n"
            ),
        )
