# OpenAPI 规范文档结构

本目录包含拆分后的 OpenAPI 规范文件，便于维护和阅读。
当前采用“正式联调规范 + 目标契约规范”双轨管理。

## AI 使用指南

> **重要**：如果你是 AI 工具，请先阅读此部分

### 应该读取哪些文件？

 **推荐读取**（50-150 行，易于理解）：
- `docs/openapi/paths/{模块}.yaml` - API 路径定义
- `docs/openapi/schemas/{模块}.yaml` - 数据模型定义

 **不要读取**（1200+ 行，太大）：
- `docs/openapi.yaml` - 自动生成的打包文件
- `docs/openapi-target.yaml` - 自动生成的目标契约打包文件

### 哪份规范给谁用？

- `docs/openapi-source.yaml` -> `docs/openapi.yaml`
  当前可联调真相源。只包含后端已经实现、前端可以直接接入的接口。
- `docs/openapi-target-source.yaml`
  目标契约真相源。包含 session-first 等规划接口，用于架构设计、任务拆解和 contract-first 开发，不作为当前联调依据。

### 快速索引

| 功能模块 | 路径定义 | 数据模型 |
|---------|---------|---------|
| 认证 | `paths/auth.yaml` | `schemas/auth.yaml` |
| 聊天 | `paths/chat.yaml` | `schemas/chat.yaml` |
| 文件 | `paths/files.yaml` | `schemas/files.yaml` |
| 生成 | `paths/generate.yaml` | `schemas/generate.yaml` |
| 预览 | `paths/preview.yaml` | `schemas/preview.yaml` |
| 项目 | `paths/project.yaml` | `schemas/project.yaml` |
| RAG | `paths/rag.yaml` | `schemas/rag.yaml` |

> `generate` 模块采用二级拆分：`generate.yaml` 为索引入口，具体定义在 `generate-*.yaml` 子文件中。

### 完整工作流程

参考 [`.ai/guides/api-workflow.md`](../../.ai/guides/api-workflow.md) 了解：
- 如何查看 API 定义
- 如何修改 API
- 如何打包和验证
- 如何生成前端类型

---

## 目录结构

```
docs/
├── openapi.yaml # 打包后的单文件（当前可联调规范）
├── openapi-source.yaml # 正式联调规范入口（只含已实现接口）
├── openapi-target-source.yaml # 目标契约入口（含规划中的 session-first 接口）
└── openapi/
 ├── paths/ # API 路径定义
 │ ├── auth.yaml # 认证相关接口
 │ ├── chat.yaml # 对话接口
 │ ├── files.yaml # 文件上传接口
 │ ├── generate.yaml # 课件生成接口
 │ ├── preview.yaml # 预览和修改接口
 │ ├── rag.yaml # 知识库检索接口
 │ └── project.yaml # 项目管理接口
 ├── schemas/ # 数据模型定义
 │ ├── common.yaml # 通用响应模型
 │ ├── auth.yaml # 认证相关模型
 │ ├── chat.yaml # 对话相关模型
 │ ├── files.yaml # 文件相关模型
 │ ├── generate.yaml # 生成相关模型
 │ ├── preview.yaml # 预览相关模型
 │ ├── rag.yaml # RAG 相关模型
 │ └── project.yaml # 项目相关模型
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

- **不要直接编辑** `docs/openapi.yaml`，它是自动生成的
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
