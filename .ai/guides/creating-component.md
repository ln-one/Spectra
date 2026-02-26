# 创建 React 组件

> 最后更新：2026-02-26 | 版本：1.0  
> 任务类型：frontend | 预估 tokens：400

## 适用场景

在前端项目中创建新的 React 组件。

---

## 必读文件

- `docs/standards/frontend.md` - 前端代码规范
- `frontend/components/ui/` - Shadcn/ui 组件库示例

---

## 组件类型

### 1. UI 组件（`components/ui/`）

基础 UI 组件，通常来自 Shadcn/ui：

```bash
# 使用 Shadcn CLI 添加组件
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add dialog
```

### 2. 业务组件（`components/`）

项目特定的业务组件：

```typescript
// components/CourseCard.tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface CourseCardProps {
  title: string;
  description: string;
  onEdit?: () => void;
}

export function CourseCard({ title, description, onEdit }: CourseCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{description}</p>
        {onEdit && (
          <Button onClick={onEdit} variant="outline">
            编辑
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
```

### 3. 页面组件（`app/`）

Next.js 页面组件：

```typescript
// app/courses/page.tsx
import { CourseCard } from '@/components/CourseCard';

export default function CoursesPage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">我的课程</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CourseCard title="课程 1" description="描述" />
      </div>
    </div>
  );
}
```

---

## 组件模板

### 基础组件

```typescript
// components/MyComponent.tsx
interface MyComponentProps {
  title: string;
  children?: React.ReactNode;
}

export function MyComponent({ title, children }: MyComponentProps) {
  return (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
```

### 带状态的组件

```typescript
// components/Counter.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div className="flex items-center gap-2">
      <Button onClick={() => setCount(count - 1)}>-</Button>
      <span>{count}</span>
      <Button onClick={() => setCount(count + 1)}>+</Button>
    </div>
  );
}
```

### 带 API 调用的组件

```typescript
// components/CourseList.tsx
'use client';

import { useEffect, useState } from 'react';
import { coursesApi } from '@/lib/api/courses';
import { CourseCard } from './CourseCard';

export function CourseList() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await coursesApi.list();
        if (response.success) {
          setCourses(response.data);
        }
      } catch (error) {
        console.error('获取课程失败:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, []);

  if (loading) return <div>加载中...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {courses.map((course) => (
        <CourseCard key={course.id} {...course} />
      ))}
    </div>
  );
}
```

---

## 最佳实践

### 命名规范

- 组件文件：`PascalCase.tsx`（如 `CourseCard.tsx`）
- 组件名称：与文件名一致（如 `export function CourseCard`）
- Props 接口：`{ComponentName}Props`（如 `CourseCardProps`）

### 文件组织

```
components/
├── ui/              # Shadcn/ui 组件
│   ├── button.tsx
│   ├── card.tsx
│   └── dialog.tsx
├── CourseCard.tsx   # 业务组件
├── CourseList.tsx
└── Sidebar.tsx
```

### TypeScript 类型

```typescript
// 定义 Props 接口
interface CourseCardProps {
  title: string;
  description?: string;  // 可选
  onEdit?: () => void;   // 可选回调
  children?: React.ReactNode;  // 子元素
}

// 使用泛型
interface ListProps<T> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}
```

### 样式

使用 Tailwind CSS：

```typescript
<div className="flex items-center gap-4 p-4 bg-white rounded-lg shadow">
  <h2 className="text-xl font-bold">标题</h2>
</div>
```

### 客户端组件

需要使用 hooks 或浏览器 API 时，添加 `'use client'`：

```typescript
'use client';

import { useState } from 'react';

export function MyComponent() {
  const [state, setState] = useState(0);
  // ...
}
```

### 性能优化

```typescript
import { memo, useCallback, useMemo } from 'react';

// 使用 memo 避免不必要的重渲染
export const CourseCard = memo(function CourseCard({ title, description }) {
  return <div>{title}</div>;
});

// 使用 useCallback 缓存回调
const handleClick = useCallback(() => {
  console.log('clicked');
}, []);

// 使用 useMemo 缓存计算结果
const filteredCourses = useMemo(() => {
  return courses.filter(c => c.active);
}, [courses]);
```

---

## 测试

```typescript
// __tests__/CourseCard.test.tsx
import { render, screen } from '@testing-library/react';
import { CourseCard } from '@/components/CourseCard';

test('renders course card', () => {
  render(
    <CourseCard 
      title="测试课程" 
      description="这是描述" 
    />
  );
  
  expect(screen.getByText('测试课程')).toBeInTheDocument();
  expect(screen.getByText('这是描述')).toBeInTheDocument();
});
```

---

## 常见问题

### Q: 何时使用 'use client'？

**A**: 当组件需要：
- 使用 React hooks（useState, useEffect 等）
- 访问浏览器 API（window, document）
- 使用事件处理器（onClick, onChange）

### Q: 如何处理表单？

**A**: 使用 React Hook Form：

```typescript
'use client';

import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface FormData {
  title: string;
  description: string;
}

export function CourseForm() {
  const { register, handleSubmit } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    console.log(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input {...register('title')} placeholder="标题" />
      <Input {...register('description')} placeholder="描述" />
      <Button type="submit">提交</Button>
    </form>
  );
}
```

### Q: 如何使用 Shadcn/ui 组件？

**A**: 
1. 添加组件：`npx shadcn-ui@latest add {component}`
2. 导入使用：`import { Button } from '@/components/ui/button'`
3. 查看文档：https://ui.shadcn.com/

---

## 相关文档

- `docs/standards/frontend.md` - 前端代码规范
- Shadcn/ui 文档：https://ui.shadcn.com/
- Next.js 文档：https://nextjs.org/docs
