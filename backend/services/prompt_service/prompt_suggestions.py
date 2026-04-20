"""Prompt builders for RAG-conditioned generation suggestions."""

from __future__ import annotations

from dataclasses import dataclass

from schemas.rag import PromptSuggestionSurface

from .escaping import escape_prompt_text
from .semantics import PromptCitationStyle, build_rag_reference_section


@dataclass(frozen=True)
class PromptSuggestionSurfacePolicy:
    retrieval_intent: str
    output_focus: str
    suggestion_max_chars: int
    tool_rules: tuple[str, ...]


PROMPT_SUGGESTION_SURFACE_POLICIES: dict[
    PromptSuggestionSurface, PromptSuggestionSurfacePolicy
] = {
    PromptSuggestionSurface.PPT_GENERATION_CONFIG: PromptSuggestionSurfacePolicy(
        retrieval_intent="教学目标、知识推进、重难点、课堂活动、课件生成方向",
        output_focus="适合填入 PPT 生成输入框的课件生成提示，允许完整型和开放型两种表达",
        suggestion_max_chars=180,
        tool_rules=(
            "每条必须明确这是 PPT 或课件生成任务。",
            "建议池要混合两类提示：一部分是可直接使用的完整型提示，一部分是更开放的内容方向型提示。",
            "完整型提示可以同时写出生成内容主题、讲解重点、视觉风格倾向、内容量或页数。",
            "开放型提示只要明确生成什么内容、重点呈现什么，不必条条都写风格和页数。",
            "视觉风格和内容量是可选增强项，不是每条都必须具备。",
            "禁止输出只描述知识点的短句，禁止输出过度模板化、机械重复的句式。",
        ),
    ),
    PromptSuggestionSurface.STUDIO_MINDMAP: PromptSuggestionSurfacePolicy(
        retrieval_intent="核心主题、知识结构、概念关系、层级组织",
        output_focus="适合生成思维导图的主题或结构切入点",
        suggestion_max_chars=32,
        tool_rules=("每条只面向思维导图生成，突出层级、概念关系或结构框架。",),
    ),
    PromptSuggestionSurface.STUDIO_GAME: PromptSuggestionSurfacePolicy(
        retrieval_intent="互动游戏主题、玩法方向、闯关目标、课堂体验",
        output_focus="适合生成课堂互动游戏的短主题或玩法方向",
        suggestion_max_chars=32,
        tool_rules=("每条只面向课堂互动游戏生成，突出玩法、目标或闯关体验。",),
    ),
    PromptSuggestionSurface.STUDIO_QUIZ: PromptSuggestionSurfacePolicy(
        retrieval_intent="重点考查范围、易错点、典型题型、随堂测评目标",
        output_focus="适合生成随堂小测的考查范围或题目方向",
        suggestion_max_chars=32,
        tool_rules=("每条只面向测验生成，突出考查范围、题型或易错点。",),
    ),
    PromptSuggestionSurface.STUDIO_ANIMATION: PromptSuggestionSurfacePolicy(
        retrieval_intent="动态过程、变量变化、关键步骤、可视化演示点",
        output_focus="适合生成教学动画的知识点或动态过程",
        suggestion_max_chars=32,
        tool_rules=("每条只面向教学动画生成，突出过程变化、步骤或可视化演示点。",),
    ),
    PromptSuggestionSurface.STUDIO_SIMULATION: PromptSuggestionSurfacePolicy(
        retrieval_intent="学生困惑、课堂追问、诊断点、教师回应策略",
        output_focus="适合生成课堂问答模拟的主题或追问方向",
        suggestion_max_chars=32,
        tool_rules=("每条只面向课堂问答模拟，突出追问、诊断或师生互动情境。",),
    ),
    PromptSuggestionSurface.STUDIO_SPEAKER_NOTES: PromptSuggestionSurfacePolicy(
        retrieval_intent="说课目标、教学亮点、师生互动重点、讲稿组织",
        output_focus="适合生成说课讲稿的主题或表达目标",
        suggestion_max_chars=32,
        tool_rules=("每条只面向说课讲稿生成，突出表达目标、教学亮点或讲稿组织。",),
    ),
    PromptSuggestionSurface.STUDIO_WORD: PromptSuggestionSurfacePolicy(
        retrieval_intent="文档主题、知识整理、报告结构、学习材料组织",
        output_focus="适合生成 Word 文档的主题或结构方向",
        suggestion_max_chars=32,
        tool_rules=("每条只面向 Word 文档生成，突出文档主题、结构或学习材料组织。",),
    ),
}


def get_prompt_suggestion_retrieval_query(
    *,
    surface: PromptSuggestionSurface,
    seed_text: str,
) -> str:
    """Build a retrieval query for a suggestion surface."""

    policy = PROMPT_SUGGESTION_SURFACE_POLICIES[surface]
    seed = seed_text.strip()
    if seed:
        return f"{seed} {policy.retrieval_intent}"
    return policy.retrieval_intent


def build_prompt_suggestion_prompt(
    *,
    surface: PromptSuggestionSurface,
    seed_text: str,
    rag_context: list[dict],
    limit: int,
) -> str:
    """Build the LLM prompt for RAG-grounded generation suggestions."""

    policy = PROMPT_SUGGESTION_SURFACE_POLICIES[surface]
    rag_section = build_rag_reference_section(
        rag_context,
        citation_style=PromptCitationStyle.SOURCE_INDEX,
    )
    safe_seed = escape_prompt_text(seed_text.strip() or "当前项目资料")
    tool_rules = "\n".join(
        f"{index}. {escape_prompt_text(rule)}"
        for index, rule in enumerate(policy.tool_rules, start=1)
    )

    return f"""你是 Spectra 的生成提示策划工具。
你的任务是只基于检索到的项目资料，为指定工具生成一个可缓存的提示建议池。

<request_context>
  <surface>{surface.value}</surface>
  <seed_text>{safe_seed}</seed_text>
  <output_focus>{escape_prompt_text(policy.output_focus)}</output_focus>
  <target_suggestion_count>{limit}</target_suggestion_count>
</request_context>

{rag_section}
<tool_specific_rules>
{tool_rules}
</tool_specific_rules>

<rules>
1. 必须围绕参考资料中的具体概念、过程、例子、重难点或课堂活动生成建议。
2. 不要只改写关键词，不要输出空泛套话，不要套固定模板。
3. 如果资料不足以支撑建议，返回空数组，不要编造。
4. suggestions 数量尽量接近 {limit}，但必须小于等于 {limit}。
5. 每条 suggestion 必须小于等于 {policy.suggestion_max_chars} 个中文字符或等价长度。
6. summary 用一句话说明这些建议共同指向的生成方向，长度小于等于 80 字。
7. 默认使用简体中文。
8. suggestion 文本中不要追加 [来源]、[来源3]、文件名、页码或任何引用尾巴。
</rules>

<output_contract>
严格只返回 JSON，不要 Markdown，不要解释：
{{
  "suggestions": ["..."],
  "summary": "..."
}}
</output_contract>"""
