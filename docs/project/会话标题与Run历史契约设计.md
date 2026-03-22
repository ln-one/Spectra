# 会话标题与 Run 历史契约设计

> 更新时间：2026-03-22
> 状态：设计中

本文档吸收前端提出的标题语义化和 run 历史需求，并约束其在现有主链路上增量实现。

## 1. 目标

解决三个问题：

1. 新建会话标题缺乏语义。
2. 同一会话内多次工具执行混在一起，历史区不可读。
3. 进行中的执行记录与最终 artifact 结果难以对齐。

## 2. 设计原则

1. 不新增平行系统，复用现有主链路：
   - `POST/GET /api/v1/generate/sessions`
   - `GET /api/v1/generate/sessions/{session_id}`
   - `GET /api/v1/generate/sessions/{session_id}/events`
   - `POST /api/v1/generate/sessions/{session_id}/commands`
   - `POST /api/v1/chat/messages`
   - `POST /api/v1/generate/studio-cards/{card_id}/execute`
   - `GET /api/v1/projects/{project_id}/artifacts`
2. 复用现有 AI 路由能力，不新增专门 title API。
3. 向后兼容，只新增可选字段和新对象，不破坏旧客户端。

## 3. 会话标题

### 3.1 默认标题

创建会话时：

- `display_title = 会话-{session_id后6位}`
- `display_title_source = default`

### 3.2 首条消息后自动语义化

当会话收到第一条用户消息后：

- 若 `display_title_source == default`
- 异步触发一次小模型标题生成
- 成功则更新：
  - `display_title`
  - `display_title_source = first_message`
  - `display_title_updated_at`
- 失败则保留默认标题

### 3.3 手动改名

后续允许通过 command 进行手动改名：

- `SET_SESSION_TITLE`

一旦手动改名：

- `display_title_source = manual`
- 自动标题生成不再覆盖

## 4. 会话标题字段

建议在 session 模型和列表项中统一增加：

- `display_title`
- `display_title_source`
- `display_title_updated_at`

同时在聊天响应里增加可选字段：

- `session_title_updated`
- `session_title`
- `session_title_source`

这样前端在首条消息后可以即时更新会话列表，不必额外刷新。

## 5. Run 的定义

这里的 `run` 指：

**一次独立的工具执行记录**

例如同一会话内：

- 第 1 次 PPT 生成
- 第 2 次 PPT 生成
- 第 1 次思维导图生成

每次都应是独立 run，而不是混成一条历史。

## 6. Run 基本语义

### 6.1 创建时机

以下入口触发一次新 run：

- Studio execute
- PPT 确认后进入生成
- 其他正式工具执行入口

### 6.2 初始展示

run 创建后立刻有标题：

- `第N次{工具名}`

其中：

- `run_id` 全局唯一
- `run_no` 在 `session_id + tool_type` 维度递增
- `run_title_source = pending`

### 6.3 异步语义化

后端可异步调用小模型，为 run 生成更像人话的标题。

成功：

- 更新同一 `run_id`
- `run_title_source = auto`

失败：

- 保留编号标题
- `run_title_source = fallback`

## 7. Run 状态一致性

一次执行过程中的所有状态变化，必须绑定同一 `run_id`。

不能出现：

- 草稿中一条记录
- 生成中又新建一条
- 完成后再新建一条

正确做法是：

**同一条 run 记录不断更新状态。**

## 8. Run 字段建议

第一版最小字段：

- `run_id`
- `session_id`
- `project_id`
- `tool_type`
- `run_no`
- `run_title`
- `run_title_source`
- `run_status`
- `run_step`
- `artifact_id`
- `created_at`
- `updated_at`

## 9. Run 数据层建议

建议新增实体表 `SessionRun`，不要只依赖事件回放。

原因：

- 刷新后仍需稳定恢复
- 历史区需要稳定排序和展示
- artifact 需要和 run 对齐
- 只靠事件回放成本高且容易不一致

建议字段：

- `id`
- `sessionId`
- `projectId`
- `toolType`
- `runNo`
- `title`
- `titleSource`
- `status`
- `step`
- `artifactId`
- `createdAt`
- `updatedAt`

第一版可以暂不要求完整 `requestPayloadSnapshot`。

## 10. artifact 对齐

artifact 生成完成后，需要在 metadata 中写入至少以下字段：

- `run_id`
- `run_no`
- `run_title`
- `tool_type`

这样前端才能把进行中的 run 和完成后的结果对齐。

## 11. 前端展示规则

前端历史区显示优先级：

1. `run_title_source in [auto, manual, fallback]` 时，显示 `run_title`
2. `run_title_source = pending` 时，显示 `第N次{工具名}`

点击任一 run，前端应能恢复：

- `run_id`
- `session_id`
- `run_step`
- `run_status`

## 12. 当前阶段取舍

第一版建议做：

- 会话默认标题
- 首条消息后自动语义化
- `SessionRun` 基础实体
- 编号标题
- run 状态绑定
- artifact 与 run 对齐

第一版先不强制做：

- `SET_RUN_TITLE`
- 太细的标题人工编辑能力
- 历史区复杂聚合视图
