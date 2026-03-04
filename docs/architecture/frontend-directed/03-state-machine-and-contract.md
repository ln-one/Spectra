# 前端导向设计：状态机与契约映射

## 1. 状态机定义

`IDLE -> CONFIGURING -> ANALYZING -> DRAFTING_OUTLINE -> AWAITING_OUTLINE_CONFIRM -> GENERATING_CONTENT -> RENDERING -> SUCCESS | FAILED`

关键回路：
- `AWAITING_OUTLINE_CONFIRM -> DRAFTING_OUTLINE`（用户要求重写大纲）
- `FAILED -> CONFIGURING`（保留参数重试）

## 2. 契约映射（Session 模型）

- 创建会话：`POST /api/v1/generate/sessions`
- 会话快照：`GET /api/v1/generate/sessions/{session_id}`
- 事件流：`GET /api/v1/generate/sessions/{session_id}/events`
- 更新大纲：`PUT /api/v1/generate/sessions/{session_id}/outline`
- 重写大纲：`POST /api/v1/generate/sessions/{session_id}/outline/redraft`
- 确认生成：`POST /api/v1/generate/sessions/{session_id}/confirm`
- 恢复会话：`POST /api/v1/generate/sessions/{session_id}/resume`
- 局部重绘：`POST /api/v1/generate/sessions/{session_id}/slides/{slide_id}/regenerate`

## 3. 前端必须消费的契约字段

- `session.state`：驱动页面 UI 主状态。
- `allowed_actions`：决定按钮可用性，避免非法操作。
- `capabilities`：特性开关，按服务端声明启用功能。
- `fallbacks`：外部能力降级记录，驱动“已自动回退”提示。
- `GenerationEvent.cursor`：断线续连位置。
- `slide.sources` / `message.citations`：输出溯源入口（至少页级可追溯）。

## 4. 冲突处理规则

- 写操作返回 `409` 时，不提示“参数错误”，而是提示“状态或版本冲突”。
- 大纲编辑提交必须带 `base_version`。
- 单页重绘建议带 `expected_render_version`。
- 无来源时必须明确显示“暂无可追溯来源”，不能静默隐藏来源区。
