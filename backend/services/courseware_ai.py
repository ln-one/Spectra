"""
Courseware AI - 课件生成相关 AI 方法

从 ai.py 拆分，包含大纲生成、结构化内容提取、课件生成、解析和 fallback。
AIService 通过 mixin 继承这些方法。
"""

import json
import logging
import re
from typing import TYPE_CHECKING, Optional

from schemas.generation import CoursewareContent
from schemas.outline import CoursewareOutline, OutlineSection

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


class CoursewareAIMixin:
    """课件生成相关方法，由 AIService 继承"""

    async def generate_outline(
        self,
        project_id: str,
        user_requirements: str,
        template_style: str = "default",
    ) -> CoursewareOutline:
        """
        生成课件结构化大纲，供用户确认/调整后再生成完整课件
        """
        from services.prompt_service import STYLE_REQUIREMENTS, _format_rag_context

        rag_context = await self._retrieve_rag_context(project_id, user_requirements)

        rag_hint = ""
        if rag_context:
            rag_hint = (
                "\n\n以下是从用户上传资料中检索到的参考内容，"
                "请据此优化大纲：\n" + _format_rag_context(rag_context)
            )

        style_desc = STYLE_REQUIREMENTS.get(
            template_style, STYLE_REQUIREMENTS["default"]
        )

        prompt = f"""你是一位资深学科教学设计师。请根据以下教学需求生成课件大纲。
{rag_hint}
教学需求：{user_requirements}
模板风格：{template_style} - {style_desc}

请严格返回以下 JSON 格式，不要包含其他内容：
{{
  "title": "课件总标题",
  "sections": [
    {{"title": "章节标题", "key_points": ["知识点1", "知识点2"], "slide_count": 2}},
    ...
  ],
  "summary": "大纲概述（一句话）"
}}

要求：
1. 章节数量 3-8 个，覆盖教学全流程（导入→讲授→练习→总结）
2. 每个章节 2-5 个关键知识点
3. slide_count 根据内容复杂度合理分配，总页数 10-20 页"""

        try:
            response = await self.generate(prompt=prompt, max_tokens=1500)
            content = response["content"].strip()

            json_match = re.search(r"\{[\s\S]*?\}", content)
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
        """大纲生成失败时的 fallback"""
        return CoursewareOutline(
            title=user_requirements[:50],
            sections=[
                OutlineSection(
                    title="导入",
                    key_points=["引入主题", "激发兴趣"],
                    slide_count=2,
                ),
                OutlineSection(
                    title="核心内容",
                    key_points=["重点概念", "案例分析"],
                    slide_count=5,
                ),
                OutlineSection(
                    title="练习与讨论",
                    key_points=["课堂练习", "小组讨论"],
                    slide_count=3,
                ),
                OutlineSection(
                    title="总结",
                    key_points=["回顾要点", "作业布置"],
                    slide_count=2,
                ),
            ],
            total_slides=14,
            summary="基础教学大纲",
        )

    async def extract_structured_content(
        self,
        project_id: str,
        user_requirements: str,
        template_style: str = "default",
        outline: Optional[CoursewareOutline] = None,
    ) -> CoursewareContent:
        """
        从 RAG 检索结果中提取结构化教学内容，生成 CoursewareContent

        先生成大纲，再按大纲逐章节生成内容，适合有上传资料的场景。
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
            f"- {s.title}（{s.slide_count}页）：{', '.join(s.key_points)}"
            for s in outline.sections
        )
        enhanced_req = (
            f"{user_requirements}\n\n"
            f"请严格按照以下大纲结构生成内容：\n{outline_guide}"
        )

        prompt = prompt_service.build_courseware_prompt(
            user_requirements=enhanced_req,
            template_style=template_style,
            rag_context=rag_context,
        )

        response = await self.generate(prompt=prompt, max_tokens=4000)
        return self._parse_courseware_response(response["content"], outline.title)

    async def generate_courseware_content(
        self,
        project_id: str,
        user_requirements: Optional[str] = None,
        template_style: str = "default",
    ) -> CoursewareContent:
        """
        生成课件内容（PPT Markdown 和教案 Markdown）

        生成前自动检索 RAG 知识库，将相关内容注入 prompt。
        """
        from services.prompt_service import prompt_service

        try:
            if not user_requirements:
                user_requirements = "通用教学课件"

            logger.info(
                f"Generating courseware content for project {project_id}",
                extra={
                    "project_id": project_id,
                    "requirements": user_requirements[:100],
                    "template_style": template_style,
                },
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
            )

            response = await self.generate(prompt=prompt, max_tokens=4000)
            courseware = self._parse_courseware_response(
                response["content"], user_requirements
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
            return self._get_fallback_courseware(user_requirements)

    def _parse_courseware_response(
        self, content: str, user_requirements: str
    ) -> CoursewareContent:
        """解析 LLM 返回的课件内容"""
        ppt_match = re.search(
            r"===PPT_CONTENT_START===(.*?)===PPT_CONTENT_END===",
            content,
            re.DOTALL,
        )
        ppt_content = ppt_match.group(1).strip() if ppt_match else ""

        lesson_match = re.search(
            r"===LESSON_PLAN_START===(.*?)===LESSON_PLAN_END===",
            content,
            re.DOTALL,
        )
        lesson_plan = lesson_match.group(1).strip() if lesson_match else ""

        if not ppt_content or not lesson_plan:
            logger.warning("Failed to parse structured response, trying simple split")
            parts = content.split("===")
            if len(parts) >= 2:
                ppt_content = parts[0].strip()
                lesson_plan = parts[1].strip() if len(parts) > 1 else ""

        title_match = re.search(r"^#\s+(.+)$", ppt_content, re.MULTILINE)
        title = title_match.group(1).strip() if title_match else user_requirements[:50]

        if not ppt_content:
            logger.warning("PPT content is empty, using fallback")
            ppt_content = f"# {title}\n\n课件内容生成中...\n\n---\n\n# 总结\n\n感谢观看"

        if not lesson_plan:
            logger.warning("Lesson plan is empty, using fallback")
            lesson_plan = (
                f"# 教学目标\n\n- 完成{title}的教学\n\n"
                f"# 教学过程\n\n## 讲授环节\n\n内容..."
            )

        return CoursewareContent(
            title=title,
            markdown_content=ppt_content,
            lesson_plan_markdown=lesson_plan,
        )

    def _get_fallback_courseware(self, user_requirements: str) -> CoursewareContent:
        """获取 fallback 课件内容（当 AI 生成失败时使用）"""
        title = user_requirements[:50] if user_requirements else "课件"

        return CoursewareContent(
            title=title,
            markdown_content=(
                f"# {title}\n\n欢迎学习\n\n---\n\n"
                f"# 学习目标\n\n- 理解核心概念\n- 掌握基本方法\n"
                f"- 能够实际应用\n\n---\n\n"
                f"# 主要内容\n\n## 概念介绍\n\n基础知识点...\n\n---\n\n"
                f"# 实践练习\n\n动手实践环节\n\n---\n\n"
                f"# 总结\n\n- 回顾重点\n- 课后作业\n- 下节预告\n"
            ),
            lesson_plan_markdown=(
                f"# 教学目标\n\n"
                f"- 知识目标：理解{title}的基本概念\n"
                f"- 技能目标：掌握{title}的基本方法\n"
                f"- 情感目标：培养学习兴趣\n\n"
                f"# 教学重点\n\n- 核心概念的理解\n- 基本方法的掌握\n\n"
                f"# 教学难点\n\n- 概念的深入理解\n- 方法的灵活应用\n\n"
                f"# 教学过程\n\n"
                f"## 导入环节（5分钟）\n\n引入主题，激发兴趣。\n\n"
                f"## 讲授环节（25分钟）\n\n讲解核心内容。\n\n"
                f"## 练习环节（10分钟）\n\n学生动手实践。\n\n"
                f"## 总结环节（5分钟）\n\n回顾重点，布置作业。\n\n"
                f"# 板书设计\n\n```\n{title}\n├── 概念\n├── 方法\n"
                f"└── 应用\n```\n\n"
                f"# 作业布置\n\n1. 复习课堂内容\n2. 完成练习题\n"
                f"3. 预习下节课\n"
            ),
        )
