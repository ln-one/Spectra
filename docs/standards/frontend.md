# 前端代码规范

> 详细规约见 [CONTRIBUTING.md](../CONTRIBUTING.md)

## 技术栈

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS + Shadcn/ui
- Framer Motion

## 命名规范

- 组件: `PascalCase.tsx`
- 工具: `camelCase.ts`
- 常量: `UPPER_SNAKE_CASE.ts`

## 代码风格

- ESLint + Prettier
- 2 空格缩进
- 单引号
- 单文件 <300 行

## 目录结构

```
app/          # 页面路由
components/   # UI组件
  ├── ui/           # 基础组件 (Shadcn/ui)
  ├── features/     # 功能组件
  └── layouts/      # 布局组件
lib/          # 工具库
  ├── api/          # API 客户端
  ├── hooks/        # 自定义 Hooks
  ├── utils/        # 工具函数
  └── types/        # 类型定义
```

## 组件规范

```typescript
interface ChatInterfaceProps {
  onSend: (message: string) => void
  messages: Message[]
}

export function ChatInterface({ onSend, messages }: ChatInterfaceProps) {
  // 组件逻辑
  return (
    // JSX
  )
}
```

## 复杂度控制

单文件超过 300 行时，拆分为文件夹：

```
# 原始
ChatInterface.tsx

# 拆分后
ChatInterface/
├── index.tsx         # 编排者
├── MessageList.tsx   # 子组件
├── MessageInput.tsx  # 子组件
└── types.ts          # 类型定义
```

## API 调用

```typescript
// lib/api/chat.ts
export async function sendMessage(data: SendMessageRequest): Promise<Message> {
  return apiRequest<Message>('/api/v1/chat/messages', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}
```

## 状态管理

- 优先使用 React Server Components
- 客户端状态使用 React Context 或 Zustand
- 避免过度使用全局状态

## 样式规范

- 使用 Tailwind CSS
- 避免内联样式
- 复用 Shadcn/ui 组件
- 响应式设计优先

## 性能优化

- 图片使用 Next.js Image 组件
- 懒加载非关键组件
- 代码分割
- 首屏加载 <3秒

