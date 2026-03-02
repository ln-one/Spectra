# Frontend Components

> 更新时间：2026-03-02
> 仅保留当前代码中的核心组件分层。

## 分层

- 页面层：`app/**/page.tsx`
- 业务组件：`components/*.tsx`
- 基础组件：`components/ui/*.tsx`

## 关键业务组件

- `ChatInterface.tsx`
- `FileUploadDropzone.tsx`
- `GeneratePanel.tsx`
- `MessageList.tsx`
- `MessageInput.tsx`
- `ProgressTracker.tsx`
- `SlidePreview.tsx`

## 设计约束

- 业务组件通过 `stores/*` 和 `lib/api/*` 获取数据
- 基础组件保持无业务依赖
- 页面层不重复实现 API 细节

## 维护规则

- 新增复杂组件时补充最小说明与测试
- 通用 UI 能下沉到 `components/ui/` 则优先下沉
