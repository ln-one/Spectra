# Frontend Architecture

> 本文档为前端架构索引，详细内容已拆分到各子文档。

## 快速导航

### 核心架构
- [Overview](./frontend/overview.md) - 架构概述、技术栈、目录结构
- [Routing](./frontend/routing.md) - 路由设计与页面结构
- [Components](./frontend/components.md) - 组件架构设计
- [State Management](./frontend/state-management.md) - 状态管理方案

### 集成与交互
- [API Integration](./frontend/api-integration.md) - API 客户端封装与服务层
- [Authentication](./frontend/authentication.md) - 认证状态管理、Token 存储
- [Auth Pages](./frontend/auth-pages.md) - 登录注册页面设计
- [UX Implementation](./frontend/ux-implementation.md) - 用户体验实现

### 响应式设计
- [Responsive Design](./frontend/responsive-design.md) - 响应式设计与移动端适配

## 技术栈

- **框架**: Next.js 15 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS + Shadcn/ui
- **动画**: Framer Motion
- **状态管理**: React Context / Zustand
- **HTTP 客户端**: Fetch API / Axios
- **表单验证**: React Hook Form + Zod

## 架构原则

1. **组件化**: 可复用的 UI 组件库
2. **类型安全**: 完整的 TypeScript 类型定义
3. **响应式**: 支持桌面端、平板端、移动端
4. **性能优化**: 懒加载、代码分割、缓存策略
5. **用户体验**: 即时反馈、渐进式引导、容错设计
