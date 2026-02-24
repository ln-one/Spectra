import logging
import re
from typing import Optional

from litellm import acompletion

from schemas.generation import CoursewareContent

logger = logging.getLogger(__name__)


class AIService:
    """Service for AI operations using LiteLLM"""

    def __init__(self):
        self.default_model = "gpt-3.5-turbo"

    async def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        max_tokens: Optional[int] = 500,
    ) -> dict:
        """
        Generate AI content using LiteLLM

        Args:
            prompt: The input prompt
            model: The model to use (defaults to gpt-3.5-turbo)
            max_tokens: Maximum tokens to generate

        Returns:
            dict with 'content', 'model', and 'tokens_used'
        """
        try:
            response = await acompletion(
                model=model or self.default_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
            )

            content = response.choices[0].message.content
            tokens_used = (
                response.usage.total_tokens if hasattr(response, "usage") else None
            )

            return {
                "content": content,
                "model": model or self.default_model,
                "tokens_used": tokens_used,
            }
        except Exception as e:
            # Log the error for debugging and monitoring
            logger.warning(f"AI generation failed: {str(e)}", exc_info=True)
            # Return a stub response if API call fails
            return {
                "content": f"AI stub response for prompt: {prompt[:50]}...",
                "model": model or self.default_model,
                "tokens_used": 0,
            }

    async def generate_courseware_content(
        self,
        project_id: str,
        user_requirements: Optional[str] = None,
        template_style: str = "default",
    ) -> CoursewareContent:
        """
        生成课件内容（PPT Markdown 和教案 Markdown）

        Args:
            project_id: 项目 ID
            user_requirements: 用户需求描述（可选，如果为空则从项目中获取）
            template_style: 模板风格

        Returns:
            CoursewareContent: 包含标题、PPT Markdown 和教案 Markdown
        """
        try:
            # 如果没有提供用户需求，使用默认主题
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

            # 构建 prompt
            prompt = self._build_courseware_prompt(user_requirements, template_style)

            # 调用 LLM 生成内容（使用更大的 token 限制）
            response = await self.generate(
                prompt=prompt,
                max_tokens=4000,
            )

            # 解析 LLM 输出
            content = response["content"]
            courseware = self._parse_courseware_response(content, user_requirements)

            logger.info(
                "Courseware content generated successfully",
                extra={
                    "project_id": project_id,
                    "title": courseware.title,
                    "ppt_length": len(courseware.markdown_content),
                    "lesson_plan_length": len(courseware.lesson_plan_markdown),
                },
            )

            return courseware

        except Exception as e:
            logger.error(
                f"Failed to generate courseware content: {str(e)}",
                extra={"project_id": project_id},
                exc_info=True,
            )

            # 记录告警，便于监控 AI 服务状态
            logger.warning(
                f"AI generation failed for project {project_id}, "
                "using fallback content",
                extra={
                    "project_id": project_id,
                    "error": str(e),
                    "template_style": template_style,
                },
            )

            # 返回 fallback 内容，确保系统不会完全失败
            return self._get_fallback_courseware(user_requirements)

    def _build_courseware_prompt(
        self, user_requirements: str, template_style: str
    ) -> str:
        """构建课件生成的 prompt"""

        # 根据模板风格添加特定要求
        style_requirements = {
            "default": "使用简洁清晰的排版，适合通用教学场景",
            "gaia": "使用现代简约风格，注重视觉美感和留白",
            "uncover": "使用动态展示风格，内容层层递进，适合演讲场景",
            "academic": "使用学术风格，注重逻辑严谨和内容深度，适合学术报告",
        }

        style_instruction = style_requirements.get(
            template_style, style_requirements["default"]
        )

        return f"""请为以下教学主题生成完整的课件内容。

教学主题：{user_requirements}
模板风格：{template_style} - {style_instruction}

请按照以下格式生成内容：

===PPT_CONTENT_START===
（这里生成 Marp 格式的 PPT Markdown，10-15 页）

要求：
1. 使用 --- 分隔每一页幻灯片
2. 每页包含清晰的标题（使用 # 一级标题）
3. 内容简洁，每页 3-5 个要点
4. 可以包含代码示例（使用 ```python 代码块）
5. 第一页是标题页，最后一页是总结
6. 风格要求：{style_instruction}

示例格式：
# 课件标题

副标题

---

# 第一章节

- 要点 1
- 要点 2
- 要点 3

===PPT_CONTENT_END===

===LESSON_PLAN_START===
（这里生成详细的教案 Markdown）

要求：
1. 包含教学目标（知识、技能、情感）
2. 包含教学重点和难点
3. 包含详细的教学过程（导入、讲授、练习、总结）
4. 每个环节标注时间分配
5. 包含板书设计和作业布置

示例格式：
# 教学目标

- 知识目标：...
- 技能目标：...

# 教学重点

- 重点 1
- 重点 2

# 教学过程

## 导入环节（5分钟）

内容...

===LESSON_PLAN_END===

请严格按照上述格式生成内容，确保包含所有标记。"""

    def _parse_courseware_response(
        self, content: str, user_requirements: str
    ) -> CoursewareContent:
        """解析 LLM 返回的课件内容"""
        # 提取 PPT 内容
        ppt_match = re.search(
            r"===PPT_CONTENT_START===(.*?)===PPT_CONTENT_END===",
            content,
            re.DOTALL,
        )
        ppt_content = ppt_match.group(1).strip() if ppt_match else ""

        # 提取教案内容
        lesson_match = re.search(
            r"===LESSON_PLAN_START===(.*?)===LESSON_PLAN_END===",
            content,
            re.DOTALL,
        )
        lesson_plan = lesson_match.group(1).strip() if lesson_match else ""

        # 如果解析失败，尝试简单分割
        if not ppt_content or not lesson_plan:
            logger.warning("Failed to parse structured response, trying simple split")
            parts = content.split("===")
            if len(parts) >= 2:
                ppt_content = parts[0].strip()
                lesson_plan = parts[1].strip() if len(parts) > 1 else ""

        # 提取标题（从 PPT 内容的第一个一级标题）
        title_match = re.search(r"^#\s+(.+)$", ppt_content, re.MULTILINE)
        title = title_match.group(1).strip() if title_match else user_requirements[:50]

        # 验证内容不为空
        if not ppt_content:
            logger.warning("PPT content is empty, using fallback")
            ppt_content = f"# {title}\n\n课件内容生成中...\n\n---\n\n# 总结\n\n感谢观看"

        if not lesson_plan:
            logger.warning("Lesson plan is empty, using fallback")
            lesson_plan = f"# 教学目标\n\n- 完成{title}的教学\n\n# 教学过程\n\n## 讲授环节\n\n内容..."

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
            markdown_content=f"""# {title}

欢迎学习

---

# 学习目标

- 理解核心概念
- 掌握基本方法
- 能够实际应用

---

# 主要内容

## 概念介绍

基础知识点...

---

# 实践练习

动手实践环节

---

# 总结

- 回顾重点
- 课后作业
- 下节预告
""",
            lesson_plan_markdown=f"""# 教学目标

- 知识目标：理解{title}的基本概念
- 技能目标：掌握{title}的基本方法
- 情感目标：培养学习兴趣

# 教学重点

- 核心概念的理解
- 基本方法的掌握

# 教学难点

- 概念的深入理解
- 方法的灵活应用

# 教学过程

## 导入环节（5分钟）

引入主题，激发兴趣。

## 讲授环节（25分钟）

讲解核心内容。

## 练习环节（10分钟）

学生动手实践。

## 总结环节（5分钟）

回顾重点，布置作业。

# 板书设计

```
{title}
├── 概念
├── 方法
└── 应用
```

# 作业布置

1. 复习课堂内容
2. 完成练习题
3. 预习下节课
""",
        )


# Global AI service instance
ai_service = AIService()
