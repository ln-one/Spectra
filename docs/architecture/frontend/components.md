# Frontend Components

> 更新时间：2026-03-20
> 本文档描述当前前端组件分层与公开导出规则。

## 分层

- 路由入口层：`app/**/page.tsx`
- 页面实现层：`app/**/_views/*`
- 项目业务层：`components/project/features/*`
- 域公开入口：`components/project/index.ts`
- 基础组件层：`components/ui/*`

## 项目域模块

- `features/chat/`：会话消息渲染与输入交互
- `features/sources/`：资料列表、状态、上传相关展示
- `features/outline-editor/`：大纲编辑与结构导航
- `features/generation/`：生成配置与触发逻辑
- `features/library/`：成果库抽屉与 tabs
- `features/studio/`：工作台及 `tools/` 子模块
- `features/header/`：项目头部与会话切换

## 设计约束

- 页面层只做编排，不承载大段业务逻辑。
- 项目域组件优先通过 `@/components/project` 统一导入。
- 业务组件通过 `stores/*` 和 `lib/sdk/*`（以及 `lib/project-space/*` 封装）获取数据。
- `components/ui/*` 保持无业务依赖，不直接耦合 store。

## 维护规则

- 新增复杂组件时，优先在对应 feature 下拆分 `components/`、`types.ts`、`constants.ts`、`use*.ts`。
- 避免新增“仅一行 re-export”壳文件；统一由模块 `index.ts` 或域入口导出。
- 若新增共享 UI，优先下沉到 `components/ui/` 或通用 `components/*`。
