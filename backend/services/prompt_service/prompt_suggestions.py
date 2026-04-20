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


PROMPT_SUGGESTION_SURFACE_POLICIES: dict[
    PromptSuggestionSurface, PromptSuggestionSurfacePolicy
] = {
    PromptSuggestionSurface.PPT_GENERATION_CONFIG: PromptSuggestionSurfacePolicy(
        retrieval_intent="教学目标、知识推进、重难点、课堂活动、课件生成方向",
        output_focus="可直接填入 PPT 生成输入框的一句话生成提示",
        suggestion_max_chars=140,
    ),
    PromptSuggestionSurface.STUDIO_MINDMAP: PromptSuggestionSurfacePolicy(
        retrieval_intent="核心主题、知识结构、概念关系、层级组织",
        output_focus="适合生成思维导图的主题或结构切入点",
        suggestion_max_chars=32,
    ),
    PromptSuggestionSurface.STUDIO_GAME: PromptSuggestionSurfacePolicy(
        retrieval_intent="互动游戏主题、玩法方向、闯关目标、课堂体验",
        output_focus="适合生成课堂互动游戏的短主题或玩法方向",
        suggestion_max_chars=32,
    ),
    PromptSuggestionSurface.STUDIO_QUIZ: PromptSuggestionSurfacePolicy(
        retrieval_intent="重点考查范围、易错点、典型题型、随堂测评目标",
        output_focus="适合生成随堂小测的考查范围或题目方向",
        suggestion_max_chars=32,
    ),
    PromptSuggestionSurface.STUDIO_ANIMATION: PromptSuggestionSurfacePolicy(
        retrieval_intent="动态过程、变量变化、关键步骤、可视化演示点",
        output_focus="适合生成教学动画的知识点或动态过程",
        suggestion_max_chars=32,
    ),
    PromptSuggestionSurface.STUDIO_SIMULATION: PromptSuggestionSurfacePolicy(
        retrieval_intent="学生困惑、课堂追问、诊断点、教师回应策略",
        output_focus="适合生成课堂问答模拟的主题或追问方向",
        suggestion_max_chars=32,
    ),
    PromptSuggestionSurface.STUDIO_SPEAKER_NOTES: PromptSuggestionSurfacePolicy(
        retrieval_intent="说课目标、教学亮点、师生互动重点、讲稿组织",
        output_focus="适合生成说课讲稿的主题或表达目标",
        suggestion_max_chars=32,
    ),
    PromptSuggestionSurface.STUDIO_WORD: PromptSuggestionSurfacePolicy(
        retrieval_intent="文档主题、知识整理、报告结构、学习材料组织",
        output_focus="适合生成 Word 文档的主题或结构方向",
        suggestion_max_chars=32,
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

    return f"""你是 Spectra 的生成提示策划工具。
你的任务是只基于检索到的项目资料，给出后续生成工具可直接使用的提示。

<request_context>
  <surface>{surface.value}</surface>
  <seed_text>{safe_seed}</seed_text>
  <output_focus>{escape_prompt_text(policy.output_focus)}</output_focus>
</request_context>

{rag_section}
<rules>
1. 必须围绕参考资料中的具体概念、过程、例子、重难点或课堂活动生成建议。
2. 不要只改写关键词，不要输出空泛套话，不要套固定模板。
3. 如果资料不足以支撑建议，返回空数组，不要编造。
4. suggestions 数量必须小于等于 {limit}。
5. 每条 suggestion 必须小于等于 {policy.suggestion_max_chars} 个中文字符或等价长度。
6. summary 用一句话说明这些建议共同指向的生成方向，长度小于等于 80 字。
7. 默认使用简体中文。
</rules>

<output_contract>
严格只返回 JSON，不要 Markdown，不要解释：
{{
  "suggestions": ["..."],
  "summary": "..."
}}
</output_contract>"""
