# Frontend API Integration

> 更新时间：2026-03-20
> 本文档只保留当前实现的请求层约定。

## 1. 请求入口

- 统一客户端：`frontend/lib/sdk/client.ts`
- 基础能力：`sdkClient`、`unwrap`、`ApiError`、`withIdempotency`
- 默认前缀：`/api/v1`

## 2. SDK 模块

- `lib/sdk/auth.ts`
- `lib/sdk/projects.ts`
- `lib/sdk/files.ts`
- `lib/sdk/chat.ts`
- `lib/sdk/generate.ts`
- `lib/sdk/preview.ts`
- `lib/sdk/rag.ts`
- `lib/sdk/project-space.ts`（兼容入口）
- `lib/sdk/project-space/*`（按资源域拆分）

## 3. 领域封装

- `lib/auth/*`：token 存储、鉴权服务、校验逻辑
- `lib/project-space/*`：Project-Space 视图层友好封装（入口：`lib/project-space/index.ts`）
- `lib/chat/*`：聊天渲染相关视图模型

## 4. 类型来源

- `frontend/lib/sdk/types.ts`：OpenAPI 生成类型（自动生成，不手改）
- `frontend/lib/types/api.ts`：历史兼容类型文件（自动生成，不手改）

## 5. 使用约束

- 页面与组件不直接 `fetch` 业务接口。
- 业务层优先消费 SDK/领域封装，不重复实现请求细节。
- 接口变更先更新 OpenAPI，再更新 SDK 与调用方。

## 6. 示例

```ts
import { projectsApi } from "@/lib/sdk/projects";

export async function getProject(projectId: string) {
  return projectsApi.getProject(projectId);
}
```
