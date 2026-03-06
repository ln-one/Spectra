# 契约优先架构调整说明（前端导向）

> 更新时间：2026-03-06
> 目标：把前端导向的交互状态机落到可执行 API 契约，支持前后端并行推进。

## 1. 调整背景

当前前端设计已经定义了“阶段式生成 + 人工确认断点 + 局部重绘 + 断线恢复”的完整体验；
当前 MVP API 仍以“创建任务 + 轮询状态”为主。

结论：需要先完成契约层升级，再进入大规模实现改造。

## 2. 关键差异清单（技术栈与实现）

| 主题 | 前端导向目标 | 当前契约/MVP现状 | 调整方向 |
|---|---|---|---|
| 状态模型 | 9态业务状态机（含人工确认） | 4态任务状态（pending/processing/completed/failed） | 增加 `GenerationState` 并保留旧 `status` |
| 交互模式 | 阶段阻断与恢复 | 单次任务流为主 | 引入 `session` 资源模型 |
| 实时通信 | 事件推送驱动动画与进度 | 轮询为主 | 增加 SSE 事件流接口 |
| 大纲共创 | 可编辑、可回写、再确认 | 无大纲确认契约 | 增加 outline 更新/确认接口 |
| 局部重绘 | 指定 slide 原子更新 | 以整任务结果为主 | 增加 slide 局部重绘接口 |
| 失败恢复 | 重连后恢复上下文与游标 | 恢复语义不完整 | 增加 resume 接口 + event cursor |
| 幂等策略 | 重试不重复执行 | 部分写接口已支持 | 全写操作统一透传 `Idempotency-Key` |

## 3. 契约设计原则（本次调整）

1. 保持向后兼容：旧入口不移除，仅标记为兼容入口。
2. 先稳定领域语义：先定状态枚举和事件字典，再扩展端点。
3. 会话优先：生成流程围绕 `session_id`，`task_id` 作为兼容字段。
4. 同步/异步双通道：
- 查询面：`GET /sessions/{id}` 读取快照。
- 推送面：`GET /sessions/{id}/events` 获取增量事件。

## 4. 新增契约摘要（OpenAPI 已更新）

### 4.1 新增路径

- `POST /api/v1/generate/sessions`
- `GET /api/v1/generate/sessions/{session_id}`
- `GET /api/v1/generate/sessions/{session_id}/events`
- `POST /api/v1/generate/sessions/{session_id}/commands`（唯一写入口）

### 4.2 核心模型

- `GenerationState`：完整 9 态状态机。
- `GenerationEvent`：统一事件结构（`event_type/state/progress/payload`）。
- `OutlineDocument`：可编辑大纲的版本化结构。
- `SessionStatePayload`：会话快照（状态、参数、大纲、结果、错误）。

### 4.3 保留兼容路径

- `POST /api/v1/generate/courseware`
- `GET /api/v1/generate/tasks/{task_id}/status`
- `GET /api/v1/generate/tasks/{task_id}/download`
- `GET /api/v1/generate/tasks/{task_id}/versions`
- `PUT /outline`、`POST /confirm`、`POST /resume`、`POST /regenerate`（deprecated 兼容别名）

## 5. 实施建议（先设计后实现）

### Phase 1：契约冻结

- 冻结状态枚举、事件类型、错误码字典。
- 冻结 outline/version 与 slide patch 语义。
- 完成 OpenAPI lint 与文档评审。

### Phase 2：兼容接入

- 保留旧任务接口，同时接入会话接口。
- 新客户端优先走 session/event 通道。

### Phase 3：收敛

- 当全部调用迁移后，再评估是否下线兼容入口。

## 6. 验收标准（架构视角）

- 任何生成任务都可映射到 9 态状态机。
- 人工确认断点必须可重入（可修改大纲并继续）。
- 局部重绘不触发全量重渲染。
- 断线重连可恢复最新状态与事件游标。
- 旧客户端不改代码仍可完成主流程。

## 7. 防返工设计约束（必须遵守）

1. 任何写操作必须可幂等重试（`Idempotency-Key`）。
2. 任何并发修改必须可检测冲突（`base_version` / `expected_render_version` + `409`）。
3. 任何前后端能力差异必须可协商（`X-Contract-Version` + `capabilities`）。
4. 新增状态或事件时，不删除既有字段，先灰度到 `state_reason`/`capabilities`。
5. 废弃接口必须给出替代路径与 Sunset 时间（在 capabilities 的 `deprecations` 中声明）。

## 8. 关联文档

- [前端导向设计文档](./前端导向设计文档.md)
- [API 契约](./api-contract.md)
- [技术栈（MVP 对齐版）](./tech-stack.md)
- [后端数据模型](./backend/data-models.md)
- [系统数据流](./system/data-flow.md)

## 9. 2026-03-06 架构补充（NotebookLM + Gamma）

1. 交互信息架构采用三栏工作台（资料/对话/大纲），并与同一 `session_id` 绑定。  
2. Gamma 风格流程作为生成主链路：`大纲初稿 -> 大纲编辑/重写 -> 确认 -> 生成`。  
3. Marp/Pandoc 保持渲染层职责，不参与会话状态建模。  
4. 数据模型冻结基线：
- `generation_session`（主状态）
- `outline_version`（大纲版本）
- `session_event`（事件流）
- `generation_task`（兼容渲染执行记录）
