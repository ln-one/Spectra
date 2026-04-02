"""Render rewrite prompt - LLM 整套重写最终 Marp 文档"""

from typing import Optional


def _get_css_reference() -> str:
    """获取 3 套设计家族的完整 CSS 参考"""
    from services.template.css_generator import (
        _EDITORIAL_BOLD_CSS,
        _ACADEMIC_MODERN_CSS,
        _VISUAL_CARDS_CSS,
        _MERMAID_STYLES,
    )

    return f"""
<css_reference>
以下是 3 套设计家族的完整 CSS 框架供参考：

## Editorial Bold（编辑粗体风格）
{_EDITORIAL_BOLD_CSS}

## Academic Modern（学术现代风格）
{_ACADEMIC_MODERN_CSS}

## Visual Cards（视觉卡片风格）
{_VISUAL_CARDS_CSS}

## Mermaid 图表样式（所有设计家族通用）
{_MERMAID_STYLES}
</css_reference>
"""


def build_courseware_render_rewrite_prompt(
    markdown_content: str,
    title: str,
    slide_count: int,
    outline_summary: Optional[str] = None,
    include_css_reference: bool = True,
) -> str:
    """
    构建 render rewrite prompt

    Args:
        markdown_content: 正文级 Markdown
        title: 课件标题
        slide_count: 幻灯片总数
        outline_summary: 大纲摘要（可选）
        include_css_reference: 是否包含完整 CSS 参考

    Returns:
        完整 prompt
    """
    outline_info = ""
    if outline_summary:
        outline_info = f"\n<outline_summary>\n{outline_summary}\n</outline_summary>\n"

    css_ref = _get_css_reference() if include_css_reference else ""

    return f"""你是视觉设计专家。基于已定稿的课件正文，重写为最终可渲染的富样式 Marp 文档。

<source_content>
{markdown_content}
</source_content>
{outline_info}
{css_ref}

<constraints>
1. 保持 {slide_count} 页，不增删页
2. 保持页序和教学推进顺序
3. 保留所有 [来源 n] 引用
4. 保留已有图片占位和图题
5. 不新增无依据的知识点
6. 允许重写表达、布局、视觉组织
7. 每 3-5 页内容中至少使用 1 个 Mermaid 图表（如果内容适合可视化）
8. 封面页必须明显区别于内容页（使用 cover 类）
9. 目录页（如果生成）必须清晰列出章节结构
</constraints>

<page_structure_examples>
## 封面页示例（cover density-sparse）
<!-- _class: cover density-sparse -->

# 课件标题

副标题或简短描述

---

## 目录页示例（toc density-medium）
<!-- _class: toc density-medium -->

# 目录

- 第一章：主题 A
- 第二章：主题 B
- 第三章：主题 C

---

## 内容页示例 - 列表页（content density-medium）
<!-- _class: content density-medium -->

# 章节标题

- 要点 1：说明
- 要点 2：说明
- 要点 3：说明

---

## 内容页示例 - 图文页（content density-sparse）
<!-- _class: content density-sparse -->

# 核心概念

流程说明文字...

```mermaid
graph LR
    A[概念A] --> B[概念B]
    B --> C[结论]
```

---
</page_structure_examples>

<mermaid_guidelines>
## Mermaid 图表使用规则

1. **何时使用**：
   - 流程说明：使用 flowchart 或 graph TD/LR
   - 关系展示：使用 graph
   - 时序说明：使用 sequenceDiagram
   - 概念层级：使用 graph TD

2. **大小控制**：
   - 节点数量：3-8 个为宜
   - 层级深度：不超过 3 层
   - 文字长度：每个节点文字不超过 15 字

3. **放置位置**：
   - 放在相关文字说明之后
   - 每页最多 1 个图表
   - 图表前后保留空行

4. **示例**：
```mermaid
graph TD
    A[开始] --> B{{判断}}
    B -->|是| C[执行]
    B -->|否| D[跳过]
    C --> E[结束]
    D --> E
```

5. **禁止**：
   - 不要生成过于复杂的图表（节点 >10）
   - 不要在封面页和目录页使用图表
   - 不要连续多页都是图表
</mermaid_guidelines>

<layout_diversity_requirements>
## 版式多样性要求

1. **封面页**：必须使用 cover 类，居中对齐，大标题
2. **目录页**：仅当 slide_count >= 7 且有明确章节结构时生成
3. **内容页变化**：
   - 标题页：仅标题 + 简短描述
   - 列表页：3-7 个要点
   - 图文页：文字 + Mermaid 图表
   - 总结页：关键要点回顾

4. **避免单调**：
   - 不要连续 3 页都是纯列表
   - 适当穿插图表页
   - 使用不同的密度档位（sparse/medium/dense）

5. **Visual Cards 特殊能力**：
   - 可以使用 .card-grid 实现两栏布局
   - 适合并列对比的内容
</layout_diversity_requirements>

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
   - 选定的设计家族完整 CSS（参考 css_reference）
   - 页面类型样式（cover/toc/content）
   - 密度样式（density-sparse/medium/dense）
   - Mermaid 图表样式

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
