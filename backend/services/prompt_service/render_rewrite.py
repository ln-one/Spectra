"""Render rewrite prompt - LLM 整套重写最终 Marp 文档"""

from typing import Optional


def _get_css_reference() -> str:
    """获取 3 套设计家族的完整 CSS 参考"""
    from services.template.css_generator import (
        _ACADEMIC_MODERN_CSS,
        _EDITORIAL_BOLD_CSS,
        _MERMAID_STYLES,
        _VISUAL_CARDS_CSS,
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
    image_references: Optional[list[dict]] = None,
) -> str:
    """
    构建 render rewrite prompt

    Args:
        markdown_content: 正文级 Markdown
        title: 课件标题
        slide_count: 幻灯片总数
        outline_summary: 大纲摘要（可选）
        include_css_reference: 是否包含完整 CSS 参考
        image_references: 图片引用列表（可选）

    Returns:
        完整 prompt
    """
    outline_info = ""
    if outline_summary:
        outline_info = f"\n<outline_summary>\n{outline_summary}\n</outline_summary>\n"

    css_ref = _get_css_reference() if include_css_reference else ""

    image_info = ""
    if image_references:
        image_list = "\n".join(
            f"- ![{img['caption']}]({img['url']})" for img in image_references[:10]
        )
        image_info = f"""
<available_images>
以下是可用的图片资源，你可以在合适的位置插入：

{image_list}

注意：
- 仅使用上述列出的图片
- 图片应与内容相关
- 每页最多 1 张图片
- 图片应放在相关文字说明之后
</available_images>
"""

    min_chart_count = max(1, slide_count // 4)

    return f"""你是视觉设计专家。基于已定稿的课件正文，重写为最终可渲染的富样式 Marp 文档。

<source_content>
{markdown_content}
</source_content>
{outline_info}
{css_ref}
{image_info}

<constraints>
1. 保持 {slide_count} 页，不增删页
2. 保持页序和教学推进顺序
3. 保留所有 [来源 n] 引用
4. 保留已有图片占位和图题
5. 不新增无依据的知识点
6. 允许重写表达、布局、视觉组织
7. **必须生成 Mermaid 图表**：至少 {min_chart_count} 个图表，分散在不同页面
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
## Mermaid 图表使用规则（必须生成）

**重要**：
你必须在课件中生成至少 {min_chart_count} 个 Mermaid 图表来辅助说明。

1. **图表类型与使用场景**：

   **流程图（flowchart/graph）** - 最常用
   ```mermaid
   flowchart TD
       A[开始] --> B{{判断条件}}
       B -->|满足| C[执行操作]
       B -->|不满足| D[跳过]
       C --> E[结束]
       D --> E
   ```
   适用：步骤说明、决策流程、算法逻辑

   **关系图（graph LR/TD）**
   ```mermaid
   graph LR
       A[概念A] --> B[概念B]
       B --> C[概念C]
       A --> C
   ```
   适用：概念关系、因果链、依赖关系

   **时序图（sequenceDiagram）**
   ```mermaid
   sequenceDiagram
       participant A as 用户
       participant B as 系统
       A->>B: 发送请求
       B->>B: 处理
       B-->>A: 返回结果
   ```
   适用：交互流程、通信过程、事件序列

   **类图（classDiagram）**
   ```mermaid
   classDiagram
       class 基类 {{
           +属性1
           +方法1()
       }}
       class 子类 {{
           +属性2
           +方法2()
       }}
       基类 <|-- 子类
   ```
   适用：结构说明、继承关系、组件架构

   **甘特图（gantt）**
   ```mermaid
   gantt
       title 项目计划
       section 阶段1
       任务A :a1, 2024-01-01, 30d
       任务B :after a1, 20d
   ```
   适用：时间规划、项目进度、里程碑

   **饼图（pie）**
   ```mermaid
   pie
       title 占比分布
       "部分A" : 45
       "部分B" : 30
       "部分C" : 25
   ```
   适用：比例展示、分布情况

2. **大小控制**：
   - 节点数量：3-8 个为宜
   - 层级深度：不超过 3 层
   - 文字长���：每个节点文字不超过 15 字

3. **放置位置**：
   - 放在相关文字说明之后
   - 每页最多 1 个图表
   - 图表前后保留空行

4. **生成策略**：
   - 识别课件中的流程、关系、结构等可视化内容
   - 优先为复杂概念生成图表
   - 分散在不同页面，避免集中
   - 不要在封面页和目录页使用图表

5. **禁止**：
   - 不要生成过于复杂的图表（节点 >10）
   - 不要连续多页都是图表
   - 不要生成与内容无关的图表
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

5. **高级版式（可选使用）**：

   **两栏布局** - 并列对比
   ```html
   <div class="two-column">
   <div>

   ## 左侧内容
   - 要点 1
   - 要点 2

   </div>
   <div>

   ## 右侧内容
   - 要点 3
   - 要点 4

   </div>
   </div>
   ```

   **左图右文布局**
   ```html
   <div class="left-image-right-text">
   <div>

   ```mermaid
   graph TD
       A --> B
   ```

   </div>
   <div>

   ## 说明文字
   - 要点 1
   - 要点 2

   </div>
   </div>
   ```

   **上图下文布局**
   ```html
   <div class="top-image-bottom-text">

   ```mermaid
   graph LR
       A --> B --> C
   ```

   ## 说明文字
   - 要点 1
   - 要点 2

   </div>
   ```

   **对比布局**
   ```html
   <div class="comparison">
   <div>

   ## 方案 A
   - 优点 1
   - 优点 2

   </div>
   <div>

   ## 方案 B
   - 优点 1
   - 优点 2

   </div>
   </div>
   ```

6. **Visual Cards 特殊能力**：
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

<!-- 启用 Mermaid 支持 -->
<script type="module">
  import mermaid from
    'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
  mermaid.initialize({{ startOnLoad: true }});
</script>

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
