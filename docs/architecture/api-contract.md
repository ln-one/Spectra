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

## 相关文档

- [OpenAPI 模块化指南](../OPENAPI_GUIDE.md)
- [OpenAPI 拆分决策](../decisions/ADR-003-openapi-modularization.md)
- [后端 OpenAPI 同步指南](../BACKEND_OPENAPI_SYNC.md)
