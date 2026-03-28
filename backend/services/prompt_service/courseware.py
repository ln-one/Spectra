"""Courseware generation and modification prompt helpers."""

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

    ppt_start = output_block_marker(PromptOutputBlock.PPT_CONTENT, start=True)
    if outline_mode:
        if outline_slide_count and outline_slide_count > 0:
            ppt_constraints = (
                f"1. Generate exactly {outline_slide_count} slides; "
                "no extra intro/summary slides.\n"
                "2. Follow confirmed outline order strictly.\n"
                "3. Every slide title must match corresponding outline title.\n"
                "4. Do not include Marp frontmatter in PPT block.\n"
                "5. Use '---' to separate slides.\n"
                "6. Expand each slide by its key points (prefer 3-5 bullets).\n"
                f"7. Visual style: {style_instruction}"
            )
        else:
            ppt_constraints = (
                "1. Follow confirmed outline order strictly.\n"
                "2. Every slide title must match corresponding outline title.\n"
                "3. Do not include Marp frontmatter in PPT block.\n"
                "4. Use '---' to separate slides.\n"
                "5. Expand each slide by its key points (prefer 3-5 bullets).\n"
                f"6. Visual style: {style_instruction}"
            )
    else:
        ppt_constraints = (
            "1. Do not include Marp frontmatter in PPT block.\n"
            "2. Use '---' to separate slides.\n"
            "3. Each slide contains one '# Title' and 3-5 bullets.\n"
            "4. First slide is title slide; last slide is summary.\n"
            f"5. Visual style: {style_instruction}"
        )

    ppt_end = output_block_marker(PromptOutputBlock.PPT_CONTENT, start=False)
    lesson_start = output_block_marker(PromptOutputBlock.LESSON_PLAN, start=True)
    lesson_end = output_block_marker(PromptOutputBlock.LESSON_PLAN, start=False)

    return f"""你是资深学科教学设计师。请基于教学需求和资料线索，先在内部完成“教学目标 -> 页面规划 -> 内容展开”的组织，再输出正式课件内容。

<generation_task>
  <task>生成完整课件内容与配套教案</task>
  <template_style>{escape_prompt_text(template_style)}</template_style>
  <style_requirement>{escape_prompt_text(style_instruction)}</style_requirement>
  <language>默认使用简体中文输出，除非用户明确要求其他语言。</language>
</generation_task>

<input_requirements>
{escape_prompt_text(user_requirements)}
</input_requirements>
{rag_section}
<planning_rules>
1. 先判断教学目标、知识推进顺序和每页承担的讲解任务，再展开页面文案。
2. 优先形成“导入 -> 讲授 -> 例子/练习 -> 总结”的稳定教学推进。
3. 每页都要可讲、可改、可继续细化，不要把讲稿原文直接堆进页面。
</planning_rules>

输出格式：
{ppt_start}
(Marp markdown slides)
规则：
{ppt_constraints}
  页面组织要求：
  1. 非 outline 模式时，默认形成封面/导入、核心讲授、案例或互动、总结收束的教学序列。
  2. 每页正文围绕一个核心结论展开，并让标题、要点、例子/提问互相支撑。
  3. 涉及图文内容时，先保证页面逻辑和版式容量，再决定是否插图。
  {PPT_QUALITY_PROMPT_RULES}
  {PPT_LAYOUT_PROMPT_RULES}
  {PPT_IMAGE_RETRIEVAL_RULES}
  {PPT_IMAGE_SELECTION_RULES}
  {PPT_IMAGE_POSITION_RULES}
  {PPT_IMAGE_QUANTITY_RULES}
  {PPT_IMAGE_INSERTION_RULES}
  禁止在正文中出现标记词
  (PPT_CONTENT_START/END, LESSON_PLAN_START/END)。
{ppt_end}

{lesson_start}
(详细教案 markdown)
规则：
1. 必须包含教学目标、教学重点、教学难点。
2. 必须包含分阶段教学过程和时间安排。
3. 必须包含板书设计与作业布置。
4. 教案要与 PPT 保持同一教学推进顺序，不要出现 PPT 没讲、教案却展开很深的段落。
5. 教案中的互动、例子和总结要能回扣 PPT 页面，而不是另起一套结构。
{lesson_end}

{COURSEWARE_FEW_SHOT}

请严格按以上标记块返回，不要附加额外说明。"""


def build_modify_prompt(
    current_content: str,
    instruction: str,
    target_slides: Optional[list[str]] = None,
) -> str:
    """Build prompt for modifying existing courseware."""
    target_info = ""
    if target_slides:
        target_info = f"\nTarget slides: {', '.join(target_slides)}"

    return f"""你是资深学科教学设计师。请根据修改指令，在保持现有教学结构尽量稳定的前提下更新课件。

<current_courseware>
{escape_prompt_text(current_content)}
</current_courseware>

<modify_instruction>
{escape_prompt_text(instruction)}{escape_prompt_text(target_info)}
</modify_instruction>

要求：
1. 未指定修改的部分尽量保持不变。
2. 保留 Marp markdown 格式与分隔符。
3. 若指令只涉及局部页，优先做局部修改，不要无端重写整份课件。
4. 修改后的内容仍应保持教学推进、标题层级和图文逻辑一致。
3. 返回完整修改后的 markdown。"""
