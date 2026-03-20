# Frontend Architecture Overview

> 状态说明（2026-03-20）：本文档已按当前 `frontend/` 实际结构更新。

## 概述

前端基于 Next.js 15 App Router，覆盖登录注册、项目列表、项目详情、生成预览等核心流程。路由入口保持轻量，页面实现收敛到 `app/**/_views`，项目域复杂交互收敛到 `components/project/features/*`。

## 技术栈（当前）

- 框架：Next.js 15 + React 18 + TypeScript
- 样式：Tailwind CSS + Shadcn/ui（`components/ui/*`）
- 动效：Framer Motion（局部使用）
- 状态管理：Zustand（`stores/*`）
- 请求层：OpenAPI 生成 SDK + 领域封装（`frontend/lib/sdk/*`、`frontend/lib/project-space/*`、`frontend/lib/chat/*`、`frontend/lib/auth/*`）
- 表单：React Hook Form + Zod

## 目录结构（关键）

- `app/`：仅保留路由入口（`page.tsx`）与页面视图（`_views/`）
- `components/project/features/`：项目域功能模块（chat / generation / header / library / outline-editor / sources / studio）
- `components/project/index.ts`：项目域统一导出入口（避免跨层直连）
- `components/ui/`：外部引入的 shadcn/ui 组件（不在业务重构中修改）
- `stores/projectStore.ts` + `stores/project-store/*`：项目域状态与 action 切片
- `lib/sdk/`：API 客户端与模块 API
- `lib/auth/`：认证内部实现；`lib/auth.ts` 为兼容门面
- `lib/project-space/`：Project-Space 领域封装入口与实现
- `hooks/`：全局通用 hooks

## 相关文档

- [Routing](./routing.md)
- [Components](./components.md)
- [State Management](./state-management.md)
- [API Integration](./api-integration.md)
- [Responsive Design](./responsive-design.md)
