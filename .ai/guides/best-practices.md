# 最佳实践指南

> 最后更新：2026-02-26 | 版本：1.0  
> 任务类型：all | 预估 tokens：500

## 代码组织

### 文件结构

**前端**：
```
frontend/
├── app/              # Next.js 页面（App Router）
├── components/       # React 组件
│   ├── ui/          # Shadcn/ui 基础组件
│   └── *.tsx        # 业务组件
├── lib/             # 工具函数和 API 客户端
│   ├── api/         # API 调用
│   └── types/       # TypeScript 类型
└── hooks/           # 自定义 hooks
```

**后端**：
```
backend/
├── routers/         # API 路由
├── services/        # 业务逻辑
├── schemas/         # Pydantic 模型
├── utils/           # 工具函数
└── tests/           # 测试文件
```

### 命名规范

**前端**：
- 组件：`PascalCase.tsx`（如 `CourseCard.tsx`）
- 工具函数：`camelCase.ts`（如 `formatDate.ts`）
- 常量：`UPPER_SNAKE_CASE.ts`（如 `API_ENDPOINTS.ts`）
- Hooks：`use*.ts`（如 `useAuth.ts`）

**后端**：
- 文件：`snake_case.py`（如 `auth_service.py`）
- 类：`PascalCase`（如 `AuthService`）
- 函数：`snake_case`（如 `create_user`）
- 常量：`UPPER_SNAKE_CASE`（如 `MAX_FILE_SIZE`）

### 模块化

**单一职责**：每个文件/函数只做一件事

```typescript
// ❌ 不好：一个文件包含多个不相关的功能
export function formatDate() { }
export function validateEmail() { }
export function fetchUser() { }

// ✅ 好：按功能拆分
// lib/utils/date.ts
export function formatDate() { }

// lib/utils/validation.ts
export function validateEmail() { }

// lib/api/users.ts
export function fetchUser() { }
```

---

## API 设计

### RESTful 原则

```yaml
# 资源命名使用复数
GET    /api/v1/courses       # 获取列表
POST   /api/v1/courses       # 创建
GET    /api/v1/courses/:id   # 获取单个
PUT    /api/v1/courses/:id   # 更新
DELETE /api/v1/courses/:id   # 删除
```

### 统一响应格式

```typescript
// 成功响应
{
  "success": true,
  "data": { ... },
  "message": "操作成功"
}

// 错误响应
{
  "success": false,
  "error": "错误信息",
  "detail": { ... }
}
```

### 错误处理

**后端**：
```python
from fastapi import HTTPException

# 使用标准 HTTP 状态码
raise HTTPException(status_code=400, detail="参数错误")
raise HTTPException(status_code=401, detail="未授权")
raise HTTPException(status_code=404, detail="资源不存在")
raise HTTPException(status_code=500, detail="服务器错误")
```

**前端**：
```typescript
try {
  const response = await api.createCourse(data);
  if (response.success) {
    // 处理成功
  }
} catch (error) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401) {
      // 处理未授权
    } else if (status === 400) {
      // 处理参数错误
    }
  }
}
```

### 版本控制

```yaml
# 在 URL 中包含版本号
/api/v1/courses
/api/v2/courses
```

---

## 前端开发

### 组件设计

**保持组件小而专注**：
```typescript
// ❌ 不好：组件太大，做太多事情
export function CoursePage() {
  // 100+ 行代码
}

// ✅ 好：拆分为小组件
export function CoursePage() {
  return (
    <>
      <CourseHeader />
      <CourseList />
      <CourseFooter />
    </>
  );
}
```

**Props 设计**：
```typescript
// ❌ 不好：Props 太多
interface CourseCardProps {
  id: string;
  title: string;
  description: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  // ... 10+ props
}

// ✅ 好：使用对象
interface CourseCardProps {
  course: Course;
  onEdit?: () => void;
}
```

### 状态管理

**使用 Zustand**：
```typescript
// stores/authStore.ts
import { create } from 'zustand';

interface AuthState {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  login: (user, token) => set({ user, token }),
  logout: () => set({ user: null, token: null }),
}));
```

### 性能优化

```typescript
// 使用 memo 避免不必要的重渲染
export const CourseCard = memo(function CourseCard({ course }) {
  return <div>{course.title}</div>;
});

// 使用 useCallback 缓存回调
const handleClick = useCallback(() => {
  console.log('clicked');
}, []);

// 使用 useMemo 缓存计算结果
const filteredCourses = useMemo(() => {
  return courses.filter(c => c.active);
}, [courses]);

// 使用动态导入减少初始加载
const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <div>Loading...</div>,
});
```

---

## 后端开发

### 异步处理

```python
# ✅ 使用 async/await
@router.get("/courses")
async def get_courses(db = Depends(get_db)):
    courses = await db.course.find_many()
    return {"success": True, "data": courses}

# ❌ 避免阻塞操作
def get_courses():
    courses = db.course.find_many()  # 同步调用
    return courses
```

### 数据库操作

```python
# ✅ 使用事务
async def create_course_with_lessons(course_data, lessons_data):
    async with db.tx() as transaction:
        course = await transaction.course.create(data=course_data)
        for lesson in lessons_data:
            await transaction.lesson.create(data={
                **lesson,
                "course_id": course.id
            })
        return course

# ✅ 使用批量操作
await db.course.create_many(data=[...])

# ❌ 避免 N+1 查询
for course in courses:
    lessons = await db.lesson.find_many(where={"course_id": course.id})
```

### 依赖注入

```python
# ✅ 使用 Depends
from fastapi import Depends
from utils.dependencies import get_current_user, get_db

@router.post("/courses")
async def create_course(
    request: CreateCourseRequest,
    current_user = Depends(get_current_user),
    db = Depends(get_db)
):
    # current_user 和 db 自动注入
    pass
```

### 错误处理

```python
# ✅ 使用 try-except
@router.post("/courses")
async def create_course(request: CreateCourseRequest):
    try:
        course = await service.create_course(request)
        return {"success": True, "data": course}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating course: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
```

---

## 测试

### 单元测试

**前端**：
```typescript
// __tests__/utils.test.ts
import { formatDate } from '@/lib/utils/date';

test('formatDate formats date correctly', () => {
  const date = new Date('2024-01-01');
  expect(formatDate(date)).toBe('2024-01-01');
});
```

**后端**：
```python
# tests/test_services.py
def test_create_course():
    course = create_course({"title": "Test"})
    assert course.title == "Test"
```

### 集成测试

**前端**：
```typescript
// __tests__/CourseList.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { CourseList } from '@/components/CourseList';

test('displays courses', async () => {
  render(<CourseList />);
  await waitFor(() => {
    expect(screen.getByText('Course 1')).toBeInTheDocument();
  });
});
```

**后端**：
```python
# tests/test_api.py
def test_create_course_api(client, auth_headers):
    response = client.post(
        "/api/v1/courses",
        json={"title": "Test"},
        headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["success"] is True
```

### E2E 测试

```typescript
// e2e/courses.spec.ts
import { test, expect } from '@playwright/test';

test('create course flow', async ({ page }) => {
  await page.goto('/courses');
  await page.click('text=创建课程');
  await page.fill('input[name="title"]', '测试课程');
  await page.click('button[type="submit"]');
  await expect(page.locator('text=测试课程')).toBeVisible();
});
```

---

## Git 工作流

### Commit 规范

```bash
# 格式
<type>(<scope>): <subject>

# 示例
feat(frontend): 添加课程列表页面
fix(backend): 修复文件上传错误
docs(api): 更新认证接口文档
refactor(frontend): 重构组件结构
test(backend): 添加课程 API 测试
```

### 分支策略

```bash
# 主分支
main          # 生产环境

# 开发分支
develop       # 开发环境

# 功能分支
feature/课程管理
feature/用户认证

# 修复分支
fix/文件上传错误
hotfix/紧急修复
```

### Pull Request

1. 创建功能分支
2. 完成开发和测试
3. 提交 PR
4. Code Review
5. 合并到 develop
6. 测试通过后合并到 main

---

## 安全

### 认证和授权

```python
# 使用 JWT token
from utils.dependencies import get_current_user

@router.post("/courses")
async def create_course(
    request: CreateCourseRequest,
    current_user = Depends(get_current_user)
):
    # 只有认证用户可以访问
    pass
```

### 输入验证

```python
# 使用 Pydantic 验证
from pydantic import BaseModel, Field, validator

class CreateCourseRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    description: str
    
    @validator('title')
    def title_must_not_be_empty(cls, v):
        if not v.strip():
            raise ValueError('Title cannot be empty')
        return v
```

### 敏感信息

```bash
# ❌ 不要提交敏感信息
DATABASE_URL=postgresql://user:password@localhost/db
API_KEY=sk-1234567890

# ✅ 使用环境变量
DATABASE_URL=${DATABASE_URL}
API_KEY=${API_KEY}
```

---

## 文档

### 代码注释

```typescript
// ✅ 好的注释：解释为什么
// 使用 debounce 避免频繁的 API 调用
const debouncedSearch = debounce(search, 300);

// ❌ 不好的注释：重复代码
// 设置 count 为 0
setCount(0);
```

### API 文档

```yaml
# OpenAPI 中添加详细描述
/api/v1/courses:
  post:
    summary: 创建课程
    description: |
      创建一个新的课程。需要认证。
      
      限制：
      - 标题长度：1-100 字符
      - 每个用户最多创建 100 个课程
```

---

## 相关文档

- `docs/standards/frontend.md` - 前端代码规范
- `docs/standards/backend.md` - 后端代码规范
- `docs/standards/git.md` - Git 规范
