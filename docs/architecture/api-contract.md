# API 契约

## 理念

### Contract-First Development (契约优先开发)
API 契约是开发的起点，前后端基于契约并行开发，避免接口不一致。

### Single Source of Truth (SSOT)
`docs/openapi.yaml` 是所有 API 定义的唯一权威来源。

## 工作流

```bash
# 1. 架构师定义契约
vim docs/openapi.yaml

# 2. 前端生成类型 (TypeScript)
npx openapi-typescript ../docs/openapi.yaml -o lib/types/api.ts

# 3. 后端生成 Schema (Pydantic)
datamodel-codegen --input ../docs/openapi.yaml --output schemas/generated.py

# 4. 前后端并行开发，基于生成的类型
```

## 响应格式 (统一)
<!-- REVIEW #B7 (P1): 此处仅定义 success/data/message；但 openapi.yaml 与后端代码的错误响应为 success/error/message，建议在契约文档中补齐并统一错误结构。 -->

```json
{
  "success": true,
  "data": {},
  "message": "操作成功"
}
```

## HTTP 状态码

- 200: 成功
- 400: 请求错误
- 401: 未认证
- 404: 未找到
- 500: 服务器错误

## 原则

1. **契约先行**: 先更新 `openapi.yaml`，再写代码
2. **类型安全**: 前后端使用生成的类型，避免手写
3. **保持同步**: 实现必须与契约一致
