"""
Prompt Service - Prompt 模板库

集中管理所有 LLM prompt 模板，支持 RAG 上下文注入。
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def _format_rag_context(rag_results: list[dict]) -> str:
    """将 RAG 检索结果格式化为 prompt 中的参考资料部分"""
    if not rag_results:
        return ""
    sections = []
    for i, r in enumerate(rag_results, 1):
        source = r.get("source", {})
        filename = source.get("filename", "未知来源")
        sections.append(f"[参考资料 {i}]（来源：{filename}）\n{r['content']}")
    return "\n\n".join(sections)


STYLE_REQUIREMENTS = {
    "default": "使用简洁清晰的排版，适合通用教学场景",
    "gaia": "使用现代简约风格，注重视觉美感和留白",
    "uncover": "使用动态展示风格，内容层层递进，适合演讲场景",
    "academic": "使用学术风格，注重逻辑严谨和内容深度，适合学术报告",
}


class PromptService:
    """Prompt 模板管理服务"""

    def build_courseware_prompt(
        self,
        user_requirements: str,
        template_style: str = "default",
        rag_context: Optional[list[dict]] = None,
    ) -> str:
        """构建课件生成 prompt（从 ai.py 迁移并增强）"""
        style_instruction = STYLE_REQUIREMENTS.get(
            template_style, STYLE_REQUIREMENTS["default"]
        )
        rag_section = ""
        if rag_context:
            formatted = _format_rag_context(rag_context)
            rag_section = f"""
以下是从用户上传资料中检索到的参考内容，请在生成课件时充分参考：

{formatted}

"""
        # PLACEHOLDER_REST_OF_PROMPT
        return f"""你是一位高级学科教学设计师。请为以下教学主题生成完整的课件内容。
{rag_section}
教学主题：{user_requirements}
模板风格：{template_style} - {style_instruction}

请按照以下格式生成内容：

===PPT_CONTENT_START===
（Marp 格式 PPT Markdown，10-15 页）

要求：
1. 使用 --- 分隔每一页幻灯片
2. 每页包含清晰的标题（使用 # 一级标题）
3. 内容简洁，每页 3-5 个要点
4. 第一页是标题页，最后一页是总结
5. 风格要求：{style_instruction}
===PPT_CONTENT_END===

===LESSON_PLAN_START===
（详细教案 Markdown）

要求：
1. 包含教学目标（知识、技能、情感）
2. 包含教学重点和难点
3. 包含详细的教学过程（导入、讲授、练习、总结）
4. 每个环节标注时间分配
5. 包含板书设计和作业布置
===LESSON_PLAN_END===

请严格按照上述格式生成内容，确保包含所有标记。"""

    def build_intent_prompt(self, user_message: str) -> str:
        """构建意图分类 prompt"""
        return f"""你是一个教学课件生成系统的意图分类器。请分析用户消息并返回 JSON。

用户消息："{user_message}"

意图类型（只能选一个）：
- describe_requirement: 用户在描述课件需求（主题、内容、风格等）
- ask_question: 用户在提问（关于系统功能、课件内容等）
- modify_courseware: 用户要求修改已生成的课件
- confirm_generation: 用户确认开始生成课件
- general_chat: 闲聊或无法归类的消息

请严格返回以下 JSON 格式，不要包含其他内容：
{{"intent": "<意图类型>", "confidence": <0.0-1.0>}}"""

    def build_modify_prompt(
        self,
        current_content: str,
        instruction: str,
        target_slides: Optional[list[str]] = None,
    ) -> str:
        """构建课件修改 prompt"""
        target_info = ""
        if target_slides:
            target_info = f"\n目标幻灯片编号：{', '.join(target_slides)}"
        return f"""你是一位高级学科教学设计师。请根据修改指令对课件内容进行修改。

当前课件内容：
{current_content}

修改指令：{instruction}{target_info}

要求：
1. 只修改指令涉及的部分，保持其余内容不变
2. 保持 Marp Markdown 格式
3. 返回修改后的完整课件内容"""

    def build_chat_response_prompt(
        self,
        user_message: str,
        intent: str,
        rag_context: Optional[list[dict]] = None,
        conversation_history: Optional[list[dict]] = None,
    ) -> str:
        """构建对话回复 prompt"""
        rag_section = ""
        if rag_context:
            formatted = _format_rag_context(rag_context)
            rag_section = f"\n参考资料：\n{formatted}\n"

        history_section = ""
        if conversation_history:
            lines = []
            for msg in conversation_history[-5:]:
                role = "用户" if msg.get("role") == "user" else "助手"
                lines.append(f"{role}：{msg['content']}")
            history_section = "\n对话历史：\n" + "\n".join(lines) + "\n"

        return f"""你是 Spectra 智能课件生成系统的 AI 助手。
{history_section}{rag_section}
用户意图：{intent}
用户消息：{user_message}

请根据用户意图给出合适的回复。如果用户在描述需求，帮助梳理和确认；如果用户在提问，给出准确回答。回复要简洁专业。"""


# 全局实例
prompt_service = PromptService()
