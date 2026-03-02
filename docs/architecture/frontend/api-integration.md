# Frontend API Integration

> 更新时间：2026-03-02
> 本文档只保留当前实现的请求层约定。

## 1. 请求入口

- 统一入口：`frontend/lib/api/client.ts`
- 基础函数：`request<T>(path, options)`
- 默认前缀：`/api/v1`

## 2. 已实现能力

- Token 注入（`Authorization: Bearer`）
- `401` 自动刷新 token
- 失败统一抛出 `ApiError`
- `FormData` 自动跳过 `Content-Type: application/json`
- 支持 `Idempotency-Key` 透传

## 3. 模块划分

- `lib/api/auth.ts`
- `lib/api/projects.ts`
- `lib/api/files.ts`
- `lib/api/chat.ts`
- `lib/api/generate.ts`
- `lib/api/preview.ts`
- `lib/api/rag.ts`

## 4. 使用约束

- 页面与组件不直接 `fetch` 后端业务接口。
- 所有接口变更先更新 OpenAPI，再更新 API 模块。
- 前端业务层只消费 `success/data/error` 结构，不解析底层异常格式。

## 5. 示例

```ts
import { request } from "@/lib/api/client";

export async function getProject(projectId: string) {
  return request(`/projects/${projectId}`);
}
```
