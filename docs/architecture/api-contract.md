# API 契约

## 理念

### Contract-First Development (契约优先开发)
API 契约是开发的起点，前后端基于契约并行开发，避免接口不一致。

### Single Source of Truth (SSOT)
`docs/openapi/` 目录下的模块化 YAML 文件是所有 API 定义的唯一权威来源。

## OpenAPI 文档架构

### 模块化组织

```
docs/openapi/
├── paths/ # API 路径定义（按模块拆分）
│ ├── auth.yaml
│ ├── files.yaml
│ ├── generate-session.yaml
│ ├── generate-session-preview.yaml
│ └── project.yaml
├── schemas/ # 数据模型定义
│ ├── auth.yaml
│ ├── files.yaml
│ ├── generate.yaml
│ └── common.yaml
└── components/ # 可复用组件
 ├── parameters.yaml
 ├── responses.yaml
 └── security.yaml
```

### 打包与验证

使用 Redocly CLI 进行文档打包和验证：

```bash
# 打包模块化文档为单一文件
npm run bundle:openapi

# 验证 OpenAPI 规范
npm run validate:openapi

# 监听文件变化自动打包
npm run watch:openapi
```

打包后的文件：`docs/openapi-target.yaml`（自动生成，不要手动编辑）

### 现状 vs 目标（Target）

- `docs/openapi.yaml`：当前实现的接口规范（基于 `docs/openapi-source.yaml`）
- `docs/openapi-target.yaml`：目标契约（基于 `docs/openapi-target-source.yaml`）
- 规则：**实现必须被 Target 覆盖**（实现 ⊆ Target），避免“实现与规划对不上”。
  - 例外：历史兼容接口（如 `/` 根路径）可在对齐校验脚本中登记为 legacy 排除项。

## 工作流

```bash
# 1. 编辑模块化 OpenAPI 文档
vim docs/openapi/paths/auth.yaml
vim docs/openapi/schemas/auth.yaml

# 2. 打包生成完整文档
npm run bundle:openapi

# 3. 验证文档规范
npm run validate:openapi

# 4. 前端生成类型（可选）
cd frontend && npx openapi-typescript ../docs/openapi-target.yaml -o lib/sdk/types.ts

# 5. 后端生成 Schema（可选）
cd backend && datamodel-codegen --input ../docs/openapi-target.yaml --output schemas/generated.py

# 6. 前后端并行开发，基于契约
```

## API 文档访问

FastAPI 自动提供两种 API 文档界面：

### Swagger UI
- **URL**: http://localhost:8000/docs
- **特点**: 交互式文档，可直接测试 API
- **适用**: 开发调试、快速测试

### ReDoc
- **URL**: http://localhost:8000/redoc
- **特点**: 美观的文档展示，适合阅读
- **适用**: API 参考、文档查阅

两种界面都基于同一个 OpenAPI 规范文件（`docs/openapi-target.yaml`）自动生成。

## 响应格式 (统一)

### 成功响应

```json
{
 "success": true,
 "data": {},
 "message": "操作成功"
}
```

### 错误响应

```json
{
 "success": false,
 "error": {
 "code": "ERROR_CODE",
 "message": "详细错误描述",
 "retryable": false,
 "details": {},
 "trace_id": "trace-xxx"
 },
 "message": "用户友好的错误消息"
}
```

## HTTP 状态码

- 200: 成功
- 400: 请求错误
- 401: 未认证
- 404: 未找到
- 500: 服务器错误

## 原则

1. **契约先行**: 先更新 `docs/openapi/` 模块文件，再写代码
2. **模块化**: 按功能模块组织 OpenAPI 文档，避免单文件过大
3. **自动打包**: 使用 Redocly CLI 自动打包，不要手动编辑 `docs/openapi-target.yaml`
4. **类型安全**: 前后端使用生成的类型，避免手写
5. **保持同步**: 实现必须与契约一致

## Project-Space 演进契约（规划中）

基于 2026-03-09 的 Project-Space 设计，下一阶段在 `/projects` 主干上扩展以下子资源：

- `references`：项目引用关系（`follow` / `pinned`，主基底/辅助引用）
- `versions`：正式版本锚点（可被引用/导出）
- `artifacts`：导出/按需外化成果（记录来源会话与版本）
- `candidate-changes`：候选变更提交与审核

当前原则：

1. 不新建平行资源体系，继续以 `/projects/*` 为主入口。
2. 只增量扩展，不破坏 session-first 主流程。
3. 对外产品叙事可称“库/课程空间/个人空间（学习空间为示例）”，内部仍保持 `project` 命名。

## 生成域契约（2026-03 架构调整）

为支撑“前端导向设计文档”中的阶段式生成体验，生成域采用“命令 + 查询 + 事件”三类契约：

- **Command（动作）**：
 - `POST /api/v1/generate/sessions`：创建会话
 - `POST /api/v1/generate/sessions/{session_id}/commands`：唯一写入口（更新大纲/重写/确认/重绘/恢复）
- **Query（读取）**：
 - `GET /api/v1/generate/sessions/{session_id}`：会话快照
- **Event（推送）**：
 - `GET /api/v1/generate/sessions/{session_id}/events`：SSE 事件流

### 状态枚举（统一）

`IDLE -> CONFIGURING -> ANALYZING -> DRAFTING_OUTLINE -> AWAITING_OUTLINE_CONFIRM -> GENERATING_CONTENT -> RENDERING -> SUCCESS|FAILED`

约束：
- `AWAITING_OUTLINE_CONFIRM` 为唯一人工确认断点。
- `FAILED` 必须返回 `error.code`、`error.message`、`retryable`。
- 会话类接口优先返回 `session_id`，`task_id` 作为兼容字段保留。
- `stateReason` 必须描述**当前状态的直接原因**：
  - `SUCCESS -> task_completed`
  - `FAILED ->` 具体失败原因
  - 不允许成功态保留上一阶段的大纲或调度原因。
- `session` 快照与 `sessionevent.payload` 必须共享同一终态语义：
  - `task_id`
  - `dispatch`
  - `rq_job_id`
  - `output_urls`
  - `error_code`
  - `retryable`

### 与旧契约兼容策略（已完成迁移）

- 旧的 `/api/v1/generate/*` 任务接口与 `/api/v1/preview/*` 已移除。
- 全量采用 `session-first` 路径作为唯一主入口。

### 可扩展性与低返工约束（新增）

1. **版本协商**：
 - 客户端可通过 `X-Contract-Version` 声明期望契约版本。
 - 服务端通过 `/api/v1/generate/capabilities` 暴露可用版本和特性。
2. **并发控制**：
 - 大纲修改必须带 `base_version`，防止覆盖他人变更。
 - 局部重绘建议带 `expected_render_version`，冲突返回 `409 Conflict`。
3. **状态冲突语义**：
 - 对“状态不允许该操作”的场景统一返回 `409`，避免前端误判为参数错误。
 - 响应中使用 `allowed_actions` 与 `transition.validated_by` 告知可执行动作和校验器。
3.1 **队列/调度语义**：
 - RQ 可用性仅以 fresh worker 为准；stale worker 只能用于观测，不能视为可执行 worker。
 - queue 状态读取失败时记为 `queue_health_unknown`，允许一次短重试后再决定是否 fallback。
 - `local_async` 仅作为明确退化路径，必须在事件 payload 中记录 `dispatch` 与 fallback reason。
4. **外部能力降级语义**：
 - 当 MinerU/Qwen-VL/Whisper 不可用时，不中断主流程，返回 `fallback`/`fallbacks` 信息。
 - 降级信息至少包含：`capability`、`fallback_used`、`fallback_target`、`user_message`。
5. **演进策略**：
 - 新能力优先通过可选字段和 `capabilities` 开关引入，不先改破坏性字段。
 - 保持 `session_id` 主模型稳定，`task_id` 仅作为兼容层存在。

### NotebookLM 三栏与 Session-First 约束（2026-03-06）

1. **Chat 作用域**：
 - `POST /api/v1/chat/messages`、`POST /api/v1/chat/voice` 支持 `session_id`；
 - 当携带 `session_id` 时，服务端必须优先按会话隔离历史、资料和引用来源。
2. **Preview/Export 作用域**：
 - 使用 `/api/v1/generate/sessions/{session_id}/preview*` 会话级接口作为唯一主路径。
3. **版本与并发**：
 - 预览修改/导出支持 `base_render_version` / `expected_render_version`，冲突返回 `409`。
4. **前端一致性**：
 - 三栏工作台（资料/对话/大纲）必须共享同一 `session_id`，禁止同屏混用跨会话数据。

## 相关文档

- [OpenAPI 模块化指南](../OPENAPI_GUIDE.md)
- [Project-Space API 草案（2026-03-09）](../project/PROJECT_SPACE_API_DRAFT_2026-03-09.md)
- [Project-Space 数据模型草案（2026-03-09）](../project/PROJECT_SPACE_DATA_MODEL_DRAFT_2026-03-09.md)
