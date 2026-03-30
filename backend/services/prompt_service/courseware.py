from __future__ import annotations

from typing import Optional

from .constants import (
    COURSEWARE_FEW_SHOT,
    PPT_IMAGE_INSERTION_RULES,
    PPT_IMAGE_POSITION_RULES,
    PPT_IMAGE_QUANTITY_RULES,
    PPT_IMAGE_RETRIEVAL_RULES,
    PPT_IMAGE_SELECTION_RULES,
    PPT_LAYOUT_PROMPT_RULES,
    PPT_QUALITY_PROMPT_RULES,
    STYLE_REQUIREMENTS,
)
from .escaping import escape_prompt_text
from .semantics import (
    PromptCitationStyle,
    PromptOutputBlock,
    build_rag_reference_section,
    output_block_marker,
)


def build_courseware_prompt(
    user_requirements: str,
    template_style: str = "default",
    rag_context: Optional[list[dict]] = None,
    outline_mode: bool = False,
    outline_slide_count: Optional[int] = None,
) -> str:
    """Build prompt for courseware generation."""
    style_instruction = STYLE_REQUIREMENTS.get(
        template_style, STYLE_REQUIREMENTS["default"]
    )

    rag_section = build_rag_reference_section(
        rag_context, citation_style=PromptCitationStyle.SOURCE_INDEX
    )

    safe_requirements = escape_prompt_text(user_requirements)

    ppt_start = output_block_marker(PromptOutputBlock.PPT_CONTENT, start=True)
    ppt_end = output_block_marker(PromptOutputBlock.PPT_CONTENT, start=False)
    lesson_start = output_block_marker(PromptOutputBlock.LESSON_PLAN, start=True)
    lesson_end = output_block_marker(PromptOutputBlock.LESSON_PLAN, start=False)

    if outline_mode:
        if outline_slide_count and outline_slide_count > 0:
            outline_rules = (
                f"1. 严格生成 {outline_slide_count} 页，不要额外添加导入页或总结页。\n"
                "2. 严格遵循已确认大纲的顺序。\n"
                "3. 每页标题必须与对应大纲标题一致。\n"
                "4. 在每页中按该页关键点展开，优先 3-5 条要点。"
            )
        else:
            outline_rules = (
                "1. 严格遵循已确认大纲的顺序。\n"
                "2. 每页标题必须与对应大纲标题一致。\n"
                "3. 在每页中按该页关键点展开，优先 3-5 条要点。"
            )
    else:
        outline_rules = (
            "1. 允许根据需求自行规划页序。\n"
            "2. 第一页建议为课程标题/导入页，最后一页建议为总结页。\n"
            "3. 单页正文优先 3-5 条要点，避免段落堆砌。"
        )

    return f"""你是资深学科教学设计师。
请基于以下需求生成完整课件内容。

<generation_task>
生成一份可直接用于教学的 PPT（Marp markdown）与配套教案。
</generation_task>

<input_requirements>
{safe_requirements}
</input_requirements>

{rag_section}<style_constraints>
模板风格：{template_style}
风格要求：{style_instruction}
默认使用简体中文输出，除非用户明确要求其他语言。
</style_constraints>

<planning_rules>
先判断教学目标、知识推进顺序和每页承担的讲解任务。

{PPT_QUALITY_PROMPT_RULES}

{PPT_LAYOUT_PROMPT_RULES}

{PPT_IMAGE_RETRIEVAL_RULES}

{PPT_IMAGE_SELECTION_RULES}

{PPT_IMAGE_POSITION_RULES}

{PPT_IMAGE_QUANTITY_RULES}

{PPT_IMAGE_INSERTION_RULES}
</planning_rules>

<slide_planning_rules>
{outline_rules}
</slide_planning_rules>

<output_contract>
{ppt_start}
(Marp markdown slides)
规则：
1. 不要在该块中输出 Marp frontmatter。
2. 使用 `---` 分隔幻灯片。
3. 仅输出课件正文，不要输出解释性旁白。
4. 禁止在正文中出现标记词（PPT_CONTENT_START/END, LESSON_PLAN_START/END）。
{ppt_end}

{lesson_start}
(详细教案 markdown)
规则：
1. 必须包含教学目标、教学重点、教学难点。
2. 必须包含分阶段教学过程和时间安排。
3. 必须包含板书设计与作业布置。
{lesson_end}
</output_contract>

{COURSEWARE_FEW_SHOT}

请严格按以上标记块返回，不要附加额外说明。"""


def build_modify_prompt(
    current_content: str,
    instruction: str,
    target_slides: Optional[list[str]] = None,
    rag_context: Optional[list[dict]] = None,
    strict_source_mode: bool = False,
) -> str:
    """Build prompt for modifying existing courseware."""
    target_info = ""
    if target_slides:
        target_info = f"\nTarget slides: {', '.join(target_slides)}"

    rag_section = build_rag_reference_section(
        rag_context,
        citation_style=PromptCitationStyle.SOURCE_INDEX,
    )

    source_constraints = ""
    if strict_source_mode:
        source_constraints = (
            "\n5. 仅允许使用参考资料中的事实。"
            "\n6. 若参考资料不足，保留原文表述，不得编造新事实。"
            "\n7. 禁止引入来源外示例、术语或结论。"
        )

    return f"""你是资深学科教学设计师。请根据修改指令，在保持现有教学结构尽量稳定的前提下更新课件。

{rag_section}<current_courseware>
{current_content}
</current_courseware>

<modify_instruction>
{instruction}{target_info}
</modify_instruction>

要求：
1. 未指定修改的部分尽量保持不变。
2. 保留 Marp markdown 格式与分隔符。
3. 若指令只涉及局部页，优先做局部修改，不要无端重写整份课件。
4. 修改后的内容仍应保持教学推进、标题层级和图文逻辑一致。{source_constraints}

返回完整修改后的 markdown。"""
