# 结构化生成流与 PPT 单页局部修改契约设计

> 更新时间：2026-03-22
> 状态：设计中

本文档用于定义两件事：

1. 像 Gamma 一样的结构化生成流
2. PPT 单页局部修改

这两块共享同一条原则：

**不是只返回最终结果，而是让内容逐步出现。**

## 1. 目标

### 1.1 结构化生成流

当前事件流主要用于状态同步。

这一阶段要补的是：

- 大纲一条一条出现
- PPT 一页一页出现
- 后续保留页内更细粒度流式的扩展位

### 1.2 PPT 单页局部修改

当前已有单页重绘基础，但产品语义还不够明确。

这一阶段要明确为：

**用户对某一页提出明确修改需求，系统只修改这一页，并尽量不影响其他页。**

## 2. 设计原则

1. 第一版先做到“一页一页流出”，不强求一行一行流出。
2. 局部修改必须带明确自然语言需求，不能是空重绘。
3. 默认只修改当前页。
4. 默认保留当前页风格、结构和整套 PPT 一致性。
5. 复用现有 `sessions / commands / events / preview` 主链路，不另起炉灶。

## 3. 结构化生成流

## 3.1 层次

第一版只要求两层：

### 大纲流

生成大纲时，按 section 逐步吐出内容。

### 页面流

生成 PPT 时，按 slide 逐页吐出内容。

页内 block 级流式作为后续扩展，不是第一版刚需。

## 3.2 事件类型建议

### 大纲阶段

- `outline.started`
- `outline.section.generated`
- `outline.completed`

### PPT 阶段

- `slides.started`
- `slide.generating`
- `slide.generated`
- `slides.completed`

### 通用阶段

- `generation.completed`
- `generation.failed`

## 3.3 事件 payload 最小字段

建议保留：

- `session_id`
- `cursor`
- `event_type`
- `stage`
- `run_id`
- `run_step`
- `partial`
- `final`

大纲流额外可带：

- `section_index`
- `section_title`
- `section_payload`

页面流额外可带：

- `slide_id`
- `slide_index`
- `slide_payload`

## 3.4 前端效果目标

前端不应只是显示“等待中”，而应做到：

- 大纲区逐条增加
- PPT 预览区逐页出现
- 用户能看到当前已生成到哪里

这就是当前阶段“Gamma 感”的核心。

## 4. PPT 单页局部修改

## 4.1 用户路径

1. 用户在预览页看到某张 PPT
2. 点击该页上的局部修改按钮
3. 弹出一个小输入框
4. 用户输入“这一页哪里不好、想怎么改”
5. 提交后系统立即接受请求
6. 当前页进入修改中状态
7. 事件流持续推送修改进展
8. 修改完成后自动替换当前页内容

## 4.2 第一版交互约束

- 入口：预览页单页卡片
- 表单：先只做一个自然语言输入框
- 输入必填
- 默认 scope：`current_slide_only`

## 4.3 请求语义

当前对外主语义不再叫“重绘”，而叫：

**单页局部修改**

请求建议最少包含：

- `slide_id`
- `instruction`
- `expected_render_version`
- `preserve_style`
- `preserve_layout`
- `preserve_deck_consistency`
- `scope`

建议默认值：

- `preserve_style = true`
- `preserve_layout = true`
- `preserve_deck_consistency = true`
- `scope = current_slide_only`

## 4.4 返回策略

### 立即返回

提交后立即返回：

- `accepted`
- `session_id`
- `slide_id`
- `command_id`
- 当前进入修改态

### 后续流式更新

通过现有 SSE 事件流继续推送：

- `slide.modify.started`
- `slide.modify.processing`
- `slide.updated`
- `slide.modify.failed`

### 最终结果

修改完成后，前端自动替换当前页，并更新 render version。

## 4.5 当前阶段取舍

第一版先不做：

- 多页联动修改
- 页内 block 级精细可视化编辑器
- 对比视图强制确认

先做“自然语言改单页 + 逐步更新 + 自动替换”。

## 5. 与当前实现的关系

当前系统已经具备：

- 生成会话 SSE 事件流
- 单页详情接口
- 单页 regenerate 能力

这一阶段不是从零开始，而是在现有基础上把：

- 事件流从“状态事件”提升为“内容逐步出现”
- 单页 regenerate 提升为“带明确需求的单页局部修改”

## 6. 当前阶段建议

C 负责后端主实现：

- 单页局部修改主链路
- 页面流事件
- 与现有 session / preview / artifact 语义对齐

B 负责前端体验：

- 单页卡片入口
- 弹窗输入
- 流式内容呈现
- 修改完成后的自动替换效果
