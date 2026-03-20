# 前端代码规范

> 详细规约见 [CONTRIBUTING.md](../CONTRIBUTING.md)

## 技术栈

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS + Shadcn/ui
- Framer Motion
- Zustand

## 命名规范

- 组件文件: `PascalCase.tsx`
- 工具与 hooks: `camelCase.ts` / `useXxx.ts`
- 常量: `UPPER_SNAKE_CASE`
- 目录: 业务目录使用 `kebab-case`（如 `outline-editor`）

## 代码风格

- ESLint + Prettier
- 2 空格缩进
- 单引号
- 单文件建议 <= 300 行（超出需按职责拆分）

## 目录结构（当前）

```text
app/                         # Next.js 路由入口
  _views/                    # 页面实现（非路由）
  projects/
    _views/
    [id]/
      _views/
      generate/
        _views/

components/
  ui/                        # shadcn/ui（外部组件，不在业务重构中改动）
  auth/
  project/
    features/                # 项目域功能模块
    index.ts                 # 项目域统一导出入口

hooks/                       # 全局 hooks

lib/
  sdk/                       # OpenAPI SDK 与 API 客户端
  auth/                      # 认证内部实现
  auth.ts                    # 兼容门面
  project-space/             # Project-Space 领域封装
  chat/                      # 聊天视图模型辅助
  types/
  utils.ts

stores/
  authStore.ts
  notificationStore.ts
  projectStore.ts            # facade
  project-store/             # 分域切片与 action
```

## 组件规范

```typescript
interface SourcesPanelProps {
  projectId: string;
  sessionId: string;
}

export function SourcesPanel({ projectId, sessionId }: SourcesPanelProps) {
  // 仅处理渲染与交互，数据读取由 store / sdk 提供
  return <div />;
}
```

## 复杂度控制

单文件超过 300 行时，按职责拆分而非机械分段：

```text
# 原始
StudioPanel.tsx

# 拆分后
studio/
  StudioPanel.tsx            # 页面编排
  constants.ts
  components/
    ToolGrid.tsx
    SessionArtifacts.tsx
  tools/
    index.ts
    ToolPanelShell.tsx
    QuizToolPanel.tsx
```

## API 调用

```typescript
import { projectsApi } from "@/lib/sdk/projects";

export async function fetchProject(projectId: string) {
  return projectsApi.getProject(projectId);
}
```

## 状态管理

- 客户端业务状态优先使用 Zustand。
- 页面层只调用语义化 action，不直接改写复杂共享状态。
- 新增项目域状态优先放在 `stores/project-store/*` 再汇总到 `projectStore.ts`。

## 样式规范

- 优先复用 `components/ui/*`
- 避免内联样式
- 保持现有视觉风格一致（布局、间距、动画参数）

## 性能优化

- 图片优先使用 Next.js `Image`
- 懒加载非关键模块
- 避免不必要的全量重渲染
- 首屏保持可交互加载体验
