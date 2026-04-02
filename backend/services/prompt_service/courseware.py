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


def build_courseware_style_prompt(
    markdown_content: str,
    slide_count: int,
    outline_summary: Optional[str] = None,
) -> str:
    """Build prompt for courseware style generation (phase 2)."""
    outline_info = ""
    if outline_summary:
        outline_info = f"\n<outline_summary>\n{outline_summary}\n</outline_summary>\n"

    return f"""你是视觉设计专家。基于已定稿的课件正文，生成样式方案。

<final_courseware_content>
{markdown_content}
</final_courseware_content>
{outline_info}
<slide_statistics>
总页数：{slide_count}
</slide_statistics>

<design_families>
你必须从以下 3 套设计家族中选择 1 套：

1. editorial_bold
   - 大标题、强分割线、编辑风
   - 适合：观点鲜明、结构清晰的内容

2. academic_modern
   - 克制学术感、清晰层级、低装饰
   - 适合：理论讲解、知识传授

3. visual_cards
   - 卡片化内容区、模块感强
   - 适合：多要点并列、视觉引导
</design_families>

<page_type_rules>
- cover：封面页，0-2 个 bullet，允许标题、副标题、导语
- toc：目录页，3-7 个目录项，不允许长段落
  - 仅当 outline.sections >= 3 且 slide_count >= 7 时生成
  - 若生成，固定为 Slide 2
- content：内容页，默认 3-5 个 bullet，上限 6 个，禁止长段正文堆砌
</page_type_rules>

<density_rules>
- sparse：稀疏，bullet <= 3，字数 < 300
- medium：中等，bullet 4-5，字数 300-600
- dense：密集，bullet >= 6，字数 > 600
</density_rules>

<output_contract>
返回 JSON，包含以下字段：

{{
  "style_manifest": {{
    "design_name": "editorial_bold | academic_modern | visual_cards",
    "palette": {{"primary": "#667eea", "secondary": "#764ba2", "text": "#2c2c2c"}},
    "typography": {{"heading": "48px", "body": "28px"}},
    "page_variants": ["cover", "toc", "content"],
    "density_rules": {{"sparse": "<=3 bullets", "medium": "4-5 bullets", "dense": ">=6 bullets"}}
  }},
  "extra_css": "/* 可选补充 CSS，不允许 @import/@font-face/url(http */",
  "page_class_plan": [
    {{"slide_index": 1, "page_type": "cover", "density": "sparse", "class_name": "cover density-sparse"}},
    {{"slide_index": 2, "page_type": "toc", "density": "medium", "class_name": "toc density-medium"}},
    {{"slide_index": 3, "page_type": "content", "density": "medium", "class_name": "content density-medium"}}
  ]
}}
</output_contract>

<constraints>
1. 不允许回写正文、教案或修改 slides
2. extra_css 禁止：@import、@font-face、url(http
3. extra_css 长度上限 5000 字符
4. page_class_plan 必须覆盖所有 {slide_count} 页
5. 必须从 3 套设计家族中选择，不允许自由发明
</constraints>

只返回 JSON，不要附加说明。"""


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

    output_contract = "\n返回完整修改后的 markdown。"
    if target_slides:
        output_contract = (
            "\n输出要求："
            "\n- 只返回目标页的 Marp markdown，不要返回整份课件。"
            "\n- 不要返回 frontmatter、教案、解释文字或额外说明。"
            "\n- 若目标页只有 1 页，只返回这一页内容。"
            "\n- 若目标页有多页，必须按原顺序返回，并用 `---` 分隔。"
            "\n- 返回页数必须与目标页数完全一致。"
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
4. 修改后的内容仍应保持教学推进、标题层级和图文逻辑一致。{source_constraints}{output_contract}
"""
