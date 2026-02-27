# Frontend Architecture Overview

## 概述

Spectra 前端基于 Next.js 15 + TypeScript + Tailwind CSS + Shadcn/ui 构建，采用三栏布局设计，支持对话式交互、多模态上传、预览修改、溯源等核心体验。

## 技术栈

- **框架**: Next.js 15 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS + Shadcn/ui
- **动画**: Framer Motion
- **状态管理**: React Context / Zustand
- **HTTP 客户端**: Fetch API Wrapper（自定义实现，支持拦截器）
- **表单验证**: React Hook Form + Zod

## 架构原则

1. **组件化**: 可复用的 UI 组件库
2. **类型安全**: 完整的 TypeScript 类型定义
3. **响应式**: 支持桌面端、平板端、移动端
4. **性能优化**: 懒加载、代码分割、缓存策略
5. **用户体验**: 即时反馈、渐进式引导、容错设计

## 目录结构

```
app/                        # 页面组件（Next.js App Router）
  layout.tsx                # 根布局
  page.tsx                  # 首页
  projects/
    [id]/
      page.tsx              # 项目详情页
      preview/
        page.tsx            # 预览页
      chat/
        page.tsx            # 对话页
      generate/
        page.tsx            # 生成页
      settings/
        page.tsx            # 项目设置页

components/                 # 业务组件
  ChatInterface.tsx         # 对话界面
  FileUploadDropzone.tsx    # 文件上传
  CoursewarePreview.tsx     # 课件预览
  Sidebar.tsx               # 侧边栏

components/ui/              # 基础 UI 组件（Shadcn/ui）
  button.tsx
  input.tsx
  dialog.tsx

lib/                        # 工具函数
  utils.ts                  # 通用工具
  api.ts                    # API 封装
  constants.ts              # 常量定义

hooks/                      # 自定义 Hooks
  use-toast.ts              # Toast 通知
  use-project.ts            # 项目状态
  use-chat.ts               # 对话状态
  use-upload.ts             # 上传状态

types/                      # TypeScript 类型定义
  project.ts
  chat.ts
  upload.ts
  courseware.ts
```

## 相关文档

- [Routing](./routing.md) - 路由设计
- [Components](./components.md) - 组件架构
- [State Management](./state-management.md) - 状态管理
- [API Integration](./api-integration.md) - API 集成
- [UX Implementation](./ux-implementation.md) - 用户体验实现
- [Responsive Design](./responsive-design.md) - 响应式设计
