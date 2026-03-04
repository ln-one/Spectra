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
│ ├── generate.yaml
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

打包后的文件：`docs/openapi.yaml`（自动生成，不要手动编辑）

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
cd frontend && npx openapi-typescript ../docs/openapi.yaml -o lib/types/api.ts

# 5. 后端生成 Schema（可选）
cd backend && datamodel-codegen --input ../docs/openapi.yaml --output schemas/generated.py

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

两种界面都基于同一个 OpenAPI 规范文件（`docs/openapi.yaml`）自动生成。

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
 "message": "详细错误描述"
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
3. **自动打包**: 使用 Redocly CLI 自动打包，不要手动编辑 `docs/openapi.yaml`
4. **类型安全**: 前后端使用生成的类型，避免手写
5. **保持同步**: 实现必须与契约一致

## 生成域契约（2026-03 架构调整）

为支撑“前端导向设计文档”中的阶段式生成体验，生成域采用“命令 + 查询 + 事件”三类契约：

- **Command（动作）**：
 - `POST /api/v1/generate/sessions`：创建会话
- `PUT /api/v1/generate/sessions/{session_id}/outline`：提交/修改大纲
- `POST /api/v1/generate/sessions/{session_id}/outline/redraft`：请求 AI 重写大纲
- `POST /api/v1/generate/sessions/{session_id}/confirm`：确认大纲并继续
 - `POST /api/v1/generate/sessions/{session_id}/slides/{slide_id}/regenerate`：局部重绘
 - `POST /api/v1/generate/sessions/{session_id}/resume`：断线恢复
- **Query（读取）**：
 - `GET /api/v1/generate/sessions/{session_id}`：会话快照
 - `GET /api/v1/generate/tasks/{task_id}/status`：兼容旧轮询状态接口
- **Event（推送）**：
 - `GET /api/v1/generate/sessions/{session_id}/events`：SSE 事件流

### 状态枚举（统一）

`IDLE -> CONFIGURING -> ANALYZING -> DRAFTING_OUTLINE -> AWAITING_OUTLINE_CONFIRM -> GENERATING_CONTENT -> RENDERING -> SUCCESS|FAILED`

约束：
- `AWAITING_OUTLINE_CONFIRM` 为唯一人工确认断点。
- `FAILED` 必须返回 `error.code`、`error.message`、`retryable`。
- 会话类接口优先返回 `session_id`，`task_id` 作为兼容字段保留。

### 与旧契约兼容策略

- 保留 `/api/v1/generate/courseware` 与 `/tasks/{task_id}/status`，避免一次性破坏现有调用。
- 新增字段时保持向后兼容：旧客户端可继续识别 `status`，新客户端消费 `state + events`。
- 统一将 `Idempotency-Key` 用于写操作接口，保证重试安全。

### 可扩展性与低返工约束（新增）

1. **版本协商**：
 - 客户端可通过 `X-Contract-Version` 声明期望契约版本。
 - 服务端通过 `/api/v1/generate/capabilities` 暴露可用版本和特性。
2. **并发控制**：
 - 大纲修改必须带 `base_version`，防止覆盖他人变更。
 - 局部重绘建议带 `expected_render_version`，冲突返回 `409 Conflict`。
3. **状态冲突语义**：
 - 对“状态不允许该操作”的场景统一返回 `409`，避免前端误判为参数错误。
 - 响应中使用 `allowed_actions` 告知可执行动作，减少重试猜测。
4. **外部能力降级语义**：
 - 当 MinerU/Qwen-VL/Whisper 不可用时，不中断主流程，返回 `fallback`/`fallbacks` 信息。
 - 降级信息至少包含：`capability`、`fallback_used`、`fallback_target`、`user_message`。
5. **演进策略**：
 - 新能力优先通过可选字段和 `capabilities` 开关引入，不先改破坏性字段。
 - 保持 `session_id` 主模型稳定，`task_id` 仅作为兼容层存在。

## 相关文档

- [OpenAPI 模块化指南](../OPENAPI_GUIDE.md)
- [OpenAPI 拆分决策](../decisions/ADR-003-openapi-modularization.md)
- [后端 OpenAPI 同步指南](../BACKEND_OPENAPI_SYNC.md)
- [前端导向设计文档](./前端导向设计文档.md)
- [契约优先架构调整说明](./contract-first-adjustment.md)
