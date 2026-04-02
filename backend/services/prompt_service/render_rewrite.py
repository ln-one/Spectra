"""Render rewrite prompt - LLM 整套重写最终 Marp 文档"""

from typing import Optional


def build_courseware_render_rewrite_prompt(
    markdown_content: str,
    title: str,
    slide_count: int,
    outline_summary: Optional[str] = None,
) -> str:
    """
    构建 render rewrite prompt

    Args:
        markdown_content: 正文级 Markdown
        title: 课件标题
        slide_count: 幻灯片总数
        outline_summary: 大纲摘要（可选）

    Returns:
        完整 prompt
    """
    outline_info = ""
    if outline_summary:
        outline_info = f"\n<outline_summary>\n{outline_summary}\n</outline_summary>\n"

    return f"""你是视觉设计专家。基于已定稿的课件正文，重写为最终可渲染的富样式 Marp 文档。

<source_content>
{markdown_content}
</source_content>
{outline_info}
<constraints>
1. 保持 {slide_count} 页，不增删页
2. 保持页序和教学推进顺序
3. 保留所有 [来源 n] 引用
4. 保留已有图片占位和图题
5. 不新增无依据的知识点或图像
6. 允许重写表达、布局、视觉组织
</constraints>

<design_requirements>
从以下 3 套设计家族中选择 1 套：

1. editorial_bold
   - 大标题、强分割线、编辑风
   - 适合：观点鲜明、结构清晰

2. academic_modern
   - 克制学术感、清晰层级、低装饰
   - 适合：理论讲解、知识传授

3. visual_cards
   - 卡片化内容区、模块感强
   - 适合：多要点并列、视觉引导

页面类型与密度：
- cover: 封面页，density-sparse
- toc: 目录页（仅当原内容有明确目录结构且 slide_count >= 7 时生成），density-medium
- content: 内容页，density-sparse|medium|dense（根据要点数量）

每页必须注入 class：
<!-- _class: cover density-sparse -->
<!-- _class: toc density-medium -->
<!-- _class: content density-medium -->
</design_requirements>

<output_format>
返回完整 Marp 文档，包含：

1. Marp frontmatter:
---
marp: true
theme: default
paginate: true
footer: 'Spectra 智能课件'
---

2. <style> 块：
   - 选定的设计家族完整 CSS
   - 页面类型样式（cover/toc/content）
   - 密度样式（density-sparse/medium/dense）

3. 每页内容：
   - 页级 class 注释
   - 重写后的 slide 内容
   - 用 --- 分隔

禁止：
- @import
- @font-face
- url(http
- 返回 JSON 或解释说明
</output_format>

只返回完整 Marp 文档，不要附加说明。"""
