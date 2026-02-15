# API 契约

> 契约优先开发

## 契约文件

**`docs/openapi.yaml`** - 所有 API 定义的单一来源

## 工作流程

1. TL 定义 `openapi.yaml`
2. 前端生成 TypeScript 类型
3. 后端生成 Pydantic Schema
4. 前后端并行开发

## 生成命令

```bash
# 前端
npx openapi-typescript ../docs/openapi.yaml -o lib/types/api.ts

# 后端
datamodel-codegen --input ../docs/openapi.yaml --output app/schemas/generated.py

# Mock Server
prism mock docs/openapi.yaml
```

## 通用规范

### 响应格式
```json
{
  "success": true,
  "data": {},
  "message": "操作成功"
}
```

### 状态码
- 200: 成功
- 400: 请求错误
- 401: 未认证
- 404: 未找到
- 500: 服务器错误

