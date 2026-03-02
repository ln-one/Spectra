# Frontend Architecture Overview

> 状态说明（2026-03-02）：本文档与当前 `frontend/` 代码结构对齐。

## 概述

前端基于 Next.js 15 App Router，承担认证、项目管理、聊天交互、文件上传、课件生成与预览相关页面。

## 技术栈（当前）

- 框架：Next.js 15 + React 18 + TypeScript
- 样式：Tailwind CSS + Shadcn 风格 UI 组件
- 动效：Framer Motion（局部使用）
- 状态管理：Zustand（业务状态）
- 请求层：Fetch API 封装（`frontend/lib/api/client.ts`）
- 表单：React Hook Form + Zod

## 目录结构（关键）

- `app/`：页面路由（auth、projects 等）
- `components/`：业务组件和 `ui/` 基础组件
- `stores/`：Zustand 状态管理
- `lib/api/`：后端 API 调用封装
- `hooks/`：通用 hooks（如 toast）

## 相关文档

- [Routing](./routing.md)
- [Components](./components.md)
- [State Management](./state-management.md)
- [API Integration](./api-integration.md)
- [Responsive Design](./responsive-design.md)
