# Session-First 改造指导（NotebookLM 三栏 + Gamma 大纲流）

> 日期：2026-03-06
> 适用范围：从 `project/task` 主流程迁移到 `project/session` 主流程
> 目标：同一 project 下多会话并行不串上下文，三栏工作台与生成链路按 `session_id` 隔离。

## 1. 本次改造结论

1. `project_id` 继续作为数据隔离边界。
2. `session_id` 升级为一次共创流程边界（资料/对话/大纲/预览/导出）。
3. `task_id` 保留为渲染执行兼容 ID，不再承载产品主语义。

## 2. 契约变更摘要（已修订）

1. Chat 支持 `session_id` 作用域（文本与语音）。
2. 新增会话级预览与导出端点：
- `GET /api/v1/generate/sessions/{session_id}/preview`
- `POST /api/v1/generate/sessions/{session_id}/preview/modify`
- `GET /api/v1/generate/sessions/{session_id}/preview/slides/{slide_id}`
- `POST /api/v1/generate/sessions/{session_id}/preview/export`
3. 旧 `task` 预览端点继续保留兼容。

## 3. 迁移策略（必须按顺序）

### Phase A：后端先兼容（不切前端）

1. C 先落地新 session 端点与 `session_id` 查询逻辑。
2. 旧端点内部适配到会话逻辑，保证旧前端不崩。
3. 返回体补齐 `session_id` / `render_version` 字段。

### Phase B：前端切流（灰度）

1. B 在三栏工作台统一维护 `activeSessionId`。
2. 新页面优先调用 session 端点。
3. 旧页面保留 task 调用做回退（feature flag）。

### Phase C：收敛

1. 新功能禁止新增 task-first 接口依赖。
2. 统计 session 端点覆盖率 > 90% 后再评估下线旧端点。

## 4. 分工执行清单

## A（架构师）

1. 冻结状态机与并发语义：`base_version`、`expected_state`、`base_render_version`。
2. 冻结兼容策略：旧端点 Sunset 计划与替代路径。
3. 组织跨组评审：B/C/D 对 `session_id` 作用域达成一致。

交付物：
- 架构文档 PR（数据模型/数据流/契约说明）
- 状态机评审记录（通过/阻塞项）

## B（前端）

1. 三栏工作台状态源改为 `activeSessionId`。
2. Chat/Preview/Export API client 优先传 `session_id`。
3. UI 明示当前会话上下文（防止用户跨会话误操作）。

交付物：
- API 调用改造 PR
- 三栏工作台状态管理 PR
- E2E：同 project 双会话并行不串数据

## C（后端）

1. Chat 接口支持按 `session_id` 检索历史与资料上下文。
2. 新增并实现 session 级 preview/export 路由。
3. 旧 task 路由透传到 session 逻辑并返回兼容字段。
4. 冲突统一返回 `409`（版本不一致/状态不允许）。

交付物：
- 路由实现 PR
- 服务层会话隔离 PR
- API 测试：命中/空命中/冲突/跨会话隔离

## D（AI/RAG）

1. 提示词模板改为显式消费 `session_id` 绑定上下文。
2. 对“跨会话误引”建立评测集与误引率指标。
3. 资料命中/空命中提示语与引用策略对齐 B/C。

交付物：
- 提示词与评测报告 PR
- 误引率基线与阈值建议

## 5. 验收用例（必须全部通过）

1. 同一 project 下会话 A 上传资料 X，会话 B 不应自动引用 X。
2. 会话 A 预览修改后导出，必须导出 A 的最新 `render_version`。
3. 并发编辑同一大纲版本，后提交方收到 `409`。
4. session 端点不可用时，旧 task 端点仍可完成最小闭环。

## 6. PR 模板要求（统一）

每个 PR 描述必须包含：

1. `Scope:` `session-first` / `compat` / `cleanup`
2. `DoD-MAP:` 对应条目（如 `D1-1,D3-2`）
3. `Migration:` 是否影响旧接口，是否可回滚
4. `Evidence:` 测试名、截图或日志

## 7. 风险与回滚

1. 风险：前端提前切到 session 端点但后端未实现完整语义，导致上下文缺失。
2. 风险：旧 task 端点与新 session 端点语义不一致，造成导出错版本。
3. 回滚：保留 task-first feature flag，一键回退旧调用路径。

