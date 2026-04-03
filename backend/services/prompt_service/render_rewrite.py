"""Render rewrite prompt - LLM 整套重写最终 Marp 文档"""

from typing import Optional


def _get_css_reference() -> str:
    """获取 Academic Modern 设计家族的完整 CSS 参考"""
    from services.template.css_generator import (
        _ACADEMIC_MODERN_CSS,
        _MERMAID_STYLES,
    )

    return f"""
<css_reference>
以下是 Academic Modern 设计家族的完整 CSS 框架供参考：

## Academic Modern（学术现代风格）
{_ACADEMIC_MODERN_CSS}

## Mermaid 图表样式
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
   - 流程/关系：`flowchart` / `graph`
   - 时序交互：`sequenceDiagram`
   - 占比统计：`pie showData`
   - 可选扩展（有必要时）：`classDiagram` / `gantt`

2. **标准中文 Mermaid 语法模板（务必优先仿写，不要改语法骨架）**：

   **模板 A：Flowchart（中文节点）**
   ```mermaid
   flowchart TD
       %% ========= 方向 =========
       %% TD / TB: 上到下
       %% LR: 左到右
       %% RL: 右到左
       %% BT: 下到上

       %% ========= 节点定义（常见形状） =========
       A[开始：矩形]
       B(圆角矩形)
       C([体育场形])
       D[[子程序]]
       E[(数据库)]
       F((圆形))
       G>非对称]
       H{{判断}}
       I{{{{六边形}}}}
       J[/平行四边形/]
       K[\\反向平行四边形\\]
       L[/梯形\\]
       M[\\反向梯形/]

       %% ========= 普通连线 / 箭头 / 文本 =========
       A -->|"进入流程"| B
       B --> C
       C --> D
       D --> E
       E --> F
       F --> G
       G --> H

       %% ========= 判断分支 =========
       H -->|"是"| I
       H -->|"否"| J

       %% ========= 虚线 / 粗线 / 无箭头 =========
       I -.->|"虚线关系"| K
       J ==>|"强调流程"| L
       K --- M

       %% ========= 双向连接 =========
       L <--> M

       %% ========= 链式写法 =========
       M --> N[结束]

       %% ========= 子图 =========
       subgraph S1["子流程：数据处理"]
           S1A[读取数据]
           S1B[清洗数据]
           S1C[输出结果]
           S1A --> S1B --> S1C
       end

       %% ========= 跨子图连线 =========
       B --> S1A
       S1C --> N

       %% ========= 注释 =========
       %% 注意：不要把裸小写 end 当普通节点文本
   ```

   **模板 B：SequenceDiagram（中文交互）**
   ```mermaid
   sequenceDiagram
       %% ========= 参与者定义 =========
       actor U as 用户
       participant FE as 前端
       participant API as 接口服务
       participant DB as 数据库
       participant MQ as 消息队列

       %% ========= 标题/编号（按需使用，有的渲染环境支持） =========
       %% autonumber

       %% ========= 普通消息 =========
       U->>FE: 打开页面
       FE->>API: 请求课程列表
       API->>DB: 查询课程
       DB-->>API: 返回数据
       API-->>FE: 返回课程列表
       FE-->>U: 展示结果

       %% ========= 自调用 =========
       API->>API: 参数校验

       %% ========= 激活 / 失活 =========
       activate API
       API->>DB: 写入访问日志
       DB-->>API: 写入成功
       deactivate API

       %% ========= 注释 =========
       Note right of FE: 前端负责渲染页面
       Note over API,DB: 这里发生一次数据库查询

       %% ========= loop 循环 =========
       loop 轮询检查任务状态
           FE->>API: 查询任务状态
           API-->>FE: 返回处理中
       end

       %% ========= alt / else 条件分支 =========
       alt 用户已登录
           FE->>API: 拉取个人信息
           API-->>FE: 返回个人信息
       else 用户未登录
           FE-->>U: 跳转登录页
       end

       %% ========= opt 可选分支 =========
       opt 用户勾选“记住我”
           FE->>API: 保存登录状态
           API-->>FE: 保存成功
       end

       %% ========= par 并行 =========
       par 并发加载课程
           FE->>API: 请求课程列表
           API-->>FE: 返回课程列表
       and 并发加载公告
           FE->>API: 请求公告列表
           API-->>FE: 返回公告列表
       end

       %% ========= critical 关键区 =========
       critical 支付关键流程
           U->>FE: 点击支付
           FE->>API: 创建订单
           API->>DB: 扣减库存
           DB-->>API: 扣减成功
       option 库存不足
           API-->>FE: 返回失败
       end

       %% ========= break 中断 =========
       break 参数非法
           API-->>FE: 返回错误信息
       end

       %% ========= 背景高亮区域 =========
       rect rgb(235, 245, 255)
           FE->>MQ: 发送异步消息
           MQ-->>API: 回调处理结果
       end
   ```

   **模板 C：Pie（中文占比）**
   ```mermaid
   pie showData
       title 课程内容占比
       "知识讲解" : 40
       "案例分析" : 20
       "课堂活动" : 15
       "练习巩固" : 15
       "总结反思" : 10
   ```

3. **稳定性硬约束（减少语法报错）**：
   - 必须从上述模板复制后改词，不要从零拼语法。
   - Flowchart 连线标签避免使用半角括号（如 `|P(empty)|`），建议改为 `|P_empty|` 或全角括号。
   - 每个 Mermaid 代码块首行必须是合法图类型关键字（如 `flowchart TD`、`sequenceDiagram`、`pie showData`）。
   - 图表前后保留空行；每页最多 1 个图表；封面页和目录页不放图表。
   - 含大表格（>= 4 行）或长列表（>= 6 bullet）的页面，不要再放 Mermaid；拆到下一页。

4. **大小控制**：
   - 节点数量：3-8 个为宜（复杂图最多 10 个）
   - 层级深度：不超过 3 层
   - 单节点文字建议不超过 15 字
   - 饼图默认独占半页以上空间，尽量放在图主导页面，避免与大表格同页。

5. **禁止**：
   - 不要返回残缺 Mermaid 代码块
   - 不要使用与正文无关的图
   - 不要连续多页都放图表
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
