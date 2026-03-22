# OpenAPI 规范文档结构

本目录包含拆分后的 OpenAPI 规范文件，便于维护和阅读。
当前采用“正式联调规范 + 目标契约规范”双轨管理。

> 2026-03 sprint 说明：`target` 表示本轮 sprint 要达成的最终契约形态；对会话化主链路（session-first）相关任务，`target` 同时也是 A->B/C/D 的实现基线。`source` 仅表示仓库当前已实现、可直接联调的现状契约。

## AI 使用指南

> **重要**：如果你是 AI 工具，请先阅读此部分

### 应该读取哪些文件？

 **推荐读取**（50-150 行，易于理解）：
- `docs/openapi/paths/{模块}.yaml` - API 路径定义
- `docs/openapi/schemas/{模块}.yaml` - 数据模型定义

 **不要读取**（1200+ 行，太大）：
- `docs/openapi.yaml` - 自动生成的打包文件（当前已实现）
- `docs/openapi-target.yaml` - 自动生成的目标契约打包文件

### 哪份规范给谁用？

- `docs/openapi-source.yaml` -> `docs/openapi.yaml`
  当前可联调真相源。只包含后端已经实现、前端可以直接接入的接口。
- `docs/openapi-target-source.yaml` -> `docs/openapi-target.yaml`
  目标契约真相源。包含本轮 sprint 目标接口（含 session-first 主链路 + Project-Space 扩展），用于架构设计与任务拆解；在代码完全落地前不视为“当前可联调现状”。

### 如何用 target 做开发拆分？

1. **以 target 为任务边界**：每个新增子资源（`references/versions/artifacts/candidate-changes`）可单独成任务，互不阻塞。
2. **先写契约再写实现**：先把目标接口写进 target，再落后端/前端代码，避免 API 对齐返工。
3. **source 只反映现状**：接口落地后，再把已实现部分同步到 source，保证联调清晰。

### 快速索引

| 功能模块 | 路径定义 | 数据模型 |
|---------|---------|---------|
| 认证 | `paths/auth.yaml` | `schemas/auth.yaml` |
| 聊天 | `paths/chat.yaml` | `schemas/chat.yaml` |
| 文件 | `paths/files.yaml` | `schemas/files.yaml` |
| 生成 | `paths/generate-session.yaml` | `schemas/generate.yaml` |
| 预览 | `paths/generate-session-preview.yaml` | `schemas/preview.yaml` |
| 项目 | `paths/project.yaml` | `schemas/project.yaml` |
| 项目空间扩展（仅 target） | `paths/project-space.yaml` | `schemas/project-space.yaml` |
| RAG | `paths/rag.yaml` | `schemas/rag.yaml` |

> `generate` 模块采用二级拆分：`generate-session.yaml` 为索引入口，具体定义在 `generate-session-*.yaml` 子文件中。

### 当前阶段 target 重点

如果你要对齐下一阶段并行开发，优先看这些 target 文件：

- 系统级业务配置页
  - `paths/system-settings-target.yaml`
  - `schemas/system-settings-target.yaml`
- 会话标题与 Run 历史
  - `paths/chat-target.yaml`
  - `schemas/chat-target.yaml`
  - `schemas/generate-session-models-target.yaml`
- 结构化生成流与单页局部修改
  - `paths/generate-session-core-target.yaml`
  - `paths/generate-session-edit-target.yaml`
  - `schemas/generate-session-requests-target.yaml`
  - `schemas/generate-command-core-target.yaml`

### 完整工作流程

参考 [`.ai/guides/api-workflow.md`](../../.ai/guides/api-workflow.md) 了解：
- 如何查看 API 定义
- 如何修改 API
- 如何打包和验证
- 如何生成前端类型

旧的 `docs/OPENAPI_GUIDE.md` 已归档，不再作为默认入口。

---

## 目录结构

```
docs/
├── openapi.yaml # 打包后的单文件（当前可联调规范）
├── openapi-source.yaml # 当前可联调规范入口（只含已实现接口）
├── openapi-target.yaml # 打包后的目标契约规范
├── openapi-target-source.yaml # 目标契约入口（含规划中的扩展接口）
└── openapi/
 ├── paths/ # API 路径定义
 │ ├── auth.yaml # 认证相关接口
 │ ├── chat.yaml # 对话接口
 │ ├── files.yaml # 文件上传接口
│ ├── generate-session.yaml # 课件生成接口索引
│ ├── generate-session-core.yaml # 会话核心路径
│ ├── generate-session-core-target.yaml # 会话核心路径（target 扩展）
│ ├── generate-session-edit.yaml # 会话编辑路径
│ ├── generate-session-edit-target.yaml # 会话编辑路径（target 扩展）
│ ├── generate-session-command.yaml # 会话命令路径
│ ├── chat-target.yaml # 聊天接口（target 扩展）
│ ├── system-settings-target.yaml # 系统级业务配置接口（target）
 │ ├── rag.yaml # 知识库检索接口
 │ └── project.yaml # 项目管理接口
 │ ├── project-target.yaml # 项目管理（target 扩展）
 │ └── project-space.yaml # 项目空间扩展（references/versions/artifacts/changes）
 ├── schemas/ # 数据模型定义
 │ ├── common.yaml # 通用响应模型
 │ ├── auth.yaml # 认证相关模型
 │ ├── chat.yaml # 对话相关模型
│ ├── files.yaml # 文件相关模型
│ ├── generate.yaml # 生成相关模型
│ ├── generate-command-core-target.yaml # 命令模型（target 扩展）
│ ├── generate-session-models-target.yaml # 会话/事件模型（target 扩展）
│ ├── generate-session-requests-target.yaml # 会话请求响应（target 扩展）
│ ├── chat-target.yaml # 聊天响应模型（target 扩展）
 │ ├── preview.yaml # 预览相关模型
 │ ├── rag.yaml # RAG 相关模型
│ ├── system-settings-target.yaml # 系统级业务配置模型（target）
 │ └── project.yaml # 项目相关模型
 │ ├── project-target.yaml # 项目扩展模型（target）
 │ └── project-space.yaml # 项目空间扩展模型
 └── components/ # 可复用组件
 ├── parameters.yaml # 通用参数
 ├── responses.yaml # 通用响应
 └── security.yaml # 安全配置
```

## 使用方法

### 1. 安装依赖

```bash
npm install
```

### 2. 编辑文件

直接编辑 `docs/openapi/` 目录下的小文件即可。

### 3. 打包成单文件

```bash
# 打包当前可联调规范
npm run bundle:openapi

# 打包目标契约规范
npm run bundle:openapi:target

# 或使用脚本（仅打包当前可联调规范）
./scripts/bundle-openapi.sh
```

### 4. 自动监听（开发时推荐）

```bash
npm run watch:openapi
```

修改任何 `docs/openapi/` 下的文件后，会自动重新打包当前可联调规范。

## 编辑规范

### 添加新接口

1. 在对应的 `paths/*.yaml` 文件中添加路径定义
2. 在对应的 `schemas/*.yaml` 文件中添加数据模型
3. 先判断接口属于“已实现”还是“目标契约”
4. 在对应入口文件中添加路径引用：
   - 已实现接口 -> `docs/openapi-source.yaml`
   - 规划接口 -> `docs/openapi-target-source.yaml`
5. 运行对应的打包命令

### 修改现有接口

直接编辑对应的文件，然后重新打包即可。

## 注意事项

- **不要直接编辑** `docs/openapi-target.yaml`，它是自动生成的
- `docs/openapi.yaml` 是当前可联调规范，不应混入未实现接口
- 目标接口先进入 `docs/openapi-target-source.yaml`，待后端落地后再切入正式规范
- 开发时编辑 `docs/openapi/` 下的文件
- 提交代码前记得运行打包命令

## 引用语法

在文件中使用 `$ref` 引用其他文件：

```yaml
# 引用同目录下的文件
$ref: '#/SchemaName'

# 引用其他目录的文件
$ref: '../schemas/auth.yaml#/UserInfo'

# 引用 components
$ref: '../components/parameters.yaml#/PageParam'
```

## 优势

- 每个文件 50-150 行，易读易维护
- 按模块组织，职责清晰
- 支持团队协作，减少冲突
- 完全兼容 Swagger UI / Redoc
- 自动打包，无需手动合并
