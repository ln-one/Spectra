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

# 课件生成 few-shot 示例（精简版，避免 prompt 过长）
COURSEWARE_FEW_SHOT = """
示例输出（仅展示前两页）：

===PPT_CONTENT_START===
---
marp: true
theme: default
paginate: true
---

# 分数的加减法
五年级数学 · 第三单元

---

# 学习目标

- 理解同分母分数加减法的运算法则
- 掌握异分母分数的通分方法
- 能够正确计算分数加减法

===PPT_CONTENT_END===

===LESSON_PLAN_START===
# 教学目标

- 知识与技能：掌握分数加减法的运算法则
- 过程与方法：通过实例探究，归纳运算规律
- 情感态度：培养数学思维能力和合作学习意识

# 教学重点

- 同分母分数加减法的运算法则
- 异分母分数的通分方法

# 教学难点

- 异分母分数加减法中最小公倍数的求解

# 教学过程

## 导入环节（5分钟）

通过"分披萨"情境引入分数概念...

===LESSON_PLAN_END===
""".strip()


class PromptService:
    """Prompt 模板管理服务"""

    def build_courseware_prompt(
        self,
        user_requirements: str,
        template_style: str = "default",
        rag_context: Optional[list[dict]] = None,
    ) -> str:
        """构建课件生成 prompt（含 few-shot 示例和 RAG 上下文）"""
        style_instruction = STYLE_REQUIREMENTS.get(
            template_style, STYLE_REQUIREMENTS["default"]
        )
        rag_section = ""
        if rag_context:
            formatted = _format_rag_context(rag_context)
            rag_section = (
                "\n以下是从用户上传资料中检索到的参考内容，"
                "请在生成课件时充分参考并引用相关知识点：\n\n"
                f"{formatted}\n\n"
            )
        return f"""你是一位资深学科教学设计师，擅长将教学内容转化为结构清晰、\
重点突出的课件。请为以下教学主题生成完整的课件内容。
{rag_section}
教学主题：{user_requirements}
模板风格：{template_style} - {style_instruction}

生成要求：

===PPT_CONTENT_START===
（Marp 格式 PPT Markdown，10-15 页）

规范：
1. 首行必须包含 Marp frontmatter（marp: true, theme, paginate）
2. 使用 --- 分隔每一页幻灯片
3. 每页使用 # 一级标题，内容 3-5 个要点
4. 第一页为标题页（含副标题），最后一页为总结回顾
5. 使用教育领域专业术语（如"教学目标""核心素养""学科思维"）
6. 风格要求：{style_instruction}
===PPT_CONTENT_END===

===LESSON_PLAN_START===
（详细教案 Markdown）

规范：
1. 教学目标分三维：知识与技能、过程与方法、情感态度与价值观
2. 明确教学重点和难点
3. 教学过程含：导入（5min）→ 讲授（20-25min）→ 练习（10min）→ 总结（5min）
4. 每个环节标注时间分配和教学方法（讲授法/讨论法/探究法等）
5. 包含板书设计和作业布置
===LESSON_PLAN_END===

{COURSEWARE_FEW_SHOT}

请严格按照上述格式生成内容，确保包含所有标记。"""

    def build_intent_prompt(self, user_message: str) -> str:
        """构建意图分类 prompt（含 few-shot 示例）"""
        return f"""你是一个教学课件生成系统的意图分类器。请分析用户消息并返回 JSON。

用户消息："{user_message}"

意图类型（只能选一个）：
- describe_requirement: 用户在描述课件需求（主题、内容、风格等）
- ask_question: 用户在提问（关于系统功能、课件内容等）
- modify_courseware: 用户要求修改已生成的课件
- confirm_generation: 用户确认开始生成课件
- general_chat: 闲聊或无法归类的消息

示例：
用户："帮我做一个关于光合作用的PPT" → {{"intent": "describe_requirement", "confidence": 0.95}}
用户："把第三页标题改成细胞分裂" → {{"intent": "modify_courseware", "confidence": 0.9}}
用户："可以开始生成了" → {{"intent": "confirm_generation", "confidence": 0.9}}
用户："这个系统支持导出PDF吗" → {{"intent": "ask_question", "confidence": 0.85}}

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
        return f"""你是一位资深学科教学设计师。请根据修改指令对课件内容进行修改。

当前课件内容：
{current_content}

修改指令：{instruction}{target_info}

要求：
1. 只修改指令涉及的部分，保持其余内容不变
2. 保持 Marp Markdown 格式（包括 frontmatter 和 --- 分隔符）
3. 返回修改后的完整课件内容
4. 确保修改后的内容在教学逻辑上连贯"""

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

        return f"""你是 Spectra 智能课件生成系统的 AI 助手，\
专注于教育领域的课件设计与教学方案制定。
{history_section}{rag_section}
用户意图：{intent}
用户消息：{user_message}

请根据用户意图给出合适的回复：
- 描述需求：帮助梳理教学目标、内容范围、学段适配
- 提问：给出准确专业的回答
- 修改课件：确认修改范围并执行
- 确认生成：总结需求并开始生成
回复要简洁专业，使用教育领域术语。"""


# 全局实例
prompt_service = PromptService()
