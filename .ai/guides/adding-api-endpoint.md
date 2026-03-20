# 添加新 API 端点

> 最后更新：2026-02-26 | 版本：1.0 
> 任务类型：api, backend, frontend | 预估 tokens：500

## 适用场景

从零开始添加一个新的 API 端点，包括 OpenAPI 定义、后端实现和前端调用。

---

## 必读文件

- `docs/openapi/paths/{模块}.yaml` - 选择合适的模块
- `docs/openapi/schemas/{模块}.yaml` - 定义数据模型
- `backend/routers/{模块}.py` - 后端路由
- `frontend/lib/sdk/{模块}.ts` - 前端 API 客户端

---

## 完整流程

### 步骤 1：选择模块

根据功能选择合适的模块：

| 功能 | 模块 |
|------|------|
| 用户认证 | `auth` |
| 聊天对话 | `chat` |
| 文件操作 | `files` |
| 内容生成 | `generate` |
| 预览功能 | `preview` |
| 项目管理 | `project` |
| 知识库 | `rag` |

### 步骤 2：定义数据模型

编辑 `docs/openapi/schemas/{模块}.yaml`：

```yaml
components:
 schemas:
 # 请求模型
 CreateCourseRequest:
 type: object
 required:
 - title
 - description
 properties:
 title:
 type: string
 minLength: 1
 maxLength: 100
 description:
 type: string
 tags:
 type: array
 items:
 type: string
 
 # 响应模型
 Course:
 type: object
 properties:
 id:
 type: string
 title:
 type: string
 description:
 type: string
 created_at:
 type: string
 format: date-time
 
 CreateCourseResponse:
 type: object
 properties:
 success:
 type: boolean
 data:
 $ref: '#/components/schemas/Course'
 message:
 type: string
```

### 步骤 3：定义 API 路径

编辑 `docs/openapi/paths/{模块}.yaml`：

```yaml
/api/v1/courses:
 post:
 summary: 创建课程
 description: 创建一个新的课程
 tags:
 - courses
 security:
 - BearerAuth: []
 requestBody:
 required: true
 content:
 application/json:
 schema:
 $ref: '../schemas/project.yaml#/components/schemas/CreateCourseRequest'
 responses:
 '200':
 description: 创建成功
 content:
 application/json:
 schema:
 $ref: '../schemas/project.yaml#/components/schemas/CreateCourseResponse'
 '400':
 $ref: '../components/responses.yaml#/components/responses/BadRequest'
 '401':
 $ref: '../components/responses.yaml#/components/responses/Unauthorized'
```

### 步骤 4：打包和验证

```bash
# 打包
npm run bundle:openapi

# 验证
npm run validate:openapi
```

### 步骤 5：生成前端类型

```bash
cd frontend
npx openapi-typescript ../docs/openapi-target.yaml -o lib/sdk/types.ts
```

### 步骤 6：实现后端

**创建 Pydantic Schema**（`backend/schemas/courses.py`）：

```python
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List

class CreateCourseRequest(BaseModel):
 title: str = Field(..., min_length=1, max_length=100)
 description: str
 tags: Optional[List[str]] = []

class Course(BaseModel):
 id: str
 title: str
 description: str
 created_at: datetime

class CreateCourseResponse(BaseModel):
 success: bool
 data: Course
 message: str
```

**创建路由**（`backend/routers/courses.py`）：

```python
from fastapi import APIRouter, HTTPException, Depends
from schemas.courses import CreateCourseRequest, CreateCourseResponse, Course
from services.database import get_db
from utils.dependencies import get_current_user

router = APIRouter(prefix="/api/v1/courses", tags=["courses"])

@router.post("", response_model=CreateCourseResponse)
async def create_course(
 request: CreateCourseRequest,
 current_user = Depends(get_current_user),
 db = Depends(get_db)
):
 """创建新课程"""
 try:
 # 创建课程
 course = await db.course.create(
 data={
 "title": request.title,
 "description": request.description,
 "user_id": current_user.id
 }
 )
 
 return CreateCourseResponse(
 success=True,
 data=Course(**course.dict()),
 message="课程创建成功"
 )
 except Exception as e:
 raise HTTPException(status_code=400, detail="Invalid request data")
```

**注册路由**（`backend/main.py`）：

```python
from routers import courses

app.include_router(courses.router)
```

### 步骤 7：实现前端

**创建 API 客户端**（`frontend/lib/sdk/courses.ts`）：

```typescript
import { apiClient } from './client';
import type { 
 CreateCourseRequest, 
 CreateCourseResponse 
} from '../types/api';

export const coursesApi = {
 create: async (data: CreateCourseRequest): Promise<CreateCourseResponse> => {
 const response = await apiClient.post('/api/v1/courses', data);
 return response.data;
 },
};
```

**在组件中使用**：

```typescript
import { coursesApi } from '@/lib/sdk/courses';
import { useState } from 'react';

export function CreateCourseForm() {
 const [loading, setLoading] = useState(false);

 const handleSubmit = async (data: CreateCourseRequest) => {
 setLoading(true);
 try {
 const response = await coursesApi.create(data);
 if (response.success) {
 console.log('课程创建成功:', response.data);
 }
 } catch (error) {
 console.error('创建失败:', error);
 } finally {
 setLoading(false);
 }
 };

 return (
 // 表单 UI
 );
}
```

### 步骤 8：编写测试

**后端测试**（`backend/tests/test_courses_api.py`）：

```python
def test_create_course_success(client, auth_headers):
 response = client.post(
 "/api/v1/courses",
 json={
 "title": "测试课程",
 "description": "这是一个测试课程"
 },
 headers=auth_headers
 )
 assert response.status_code == 200
 data = response.json()
 assert data["success"] is True
 assert data["data"]["title"] == "测试课程"

def test_create_course_unauthorized(client):
 response = client.post(
 "/api/v1/courses",
 json={"title": "测试", "description": "测试"}
 )
 assert response.status_code == 401
```

**前端测试**（`frontend/__tests__/courses.test.ts`）：

```typescript
import { coursesApi } from '@/lib/sdk/courses';

test('create course success', async () => {
 const response = await coursesApi.create({
 title: '测试课程',
 description: '这是一个测试课程'
 });
 
 expect(response.success).toBe(true);
 expect(response.data.title).toBe('测试课程');
});
```

### 步骤 9：运行测试

```bash
# 后端测试
cd backend
pytest tests/test_courses_api.py

# 前端测试
cd frontend
npm run test
```

---

## 完整示例

### OpenAPI Schema

```yaml
# docs/openapi/schemas/project.yaml
CreateCourseRequest:
 type: object
 required: [title, description]
 properties:
 title: {type: string, minLength: 1, maxLength: 100}
 description: {type: string}
```

### OpenAPI Path

```yaml
# docs/openapi/paths/project.yaml
/api/v1/courses:
 post:
 summary: 创建课程
 tags: [courses]
 security: [{BearerAuth: []}]
 requestBody:
 required: true
 content:
 application/json:
 schema:
 $ref: '../schemas/project.yaml#/components/schemas/CreateCourseRequest'
```

### 后端实现

```python
# backend/routers/courses.py
@router.post("", response_model=CreateCourseResponse)
async def create_course(request: CreateCourseRequest):
 course = await db.course.create(data=request.dict())
 return CreateCourseResponse(success=True, data=course)
```

### 前端调用

```typescript
// frontend/lib/sdk/courses.ts
export const coursesApi = {
 create: async (data: CreateCourseRequest) => {
 return await apiClient.post('/api/v1/courses', data);
 }
};
```

---

## 验证清单

- [ ] 数据模型已定义（`schemas/{模块}.yaml`）
- [ ] API 路径已定义（`paths/{模块}.yaml`）
- [ ] OpenAPI 打包成功（`npm run bundle:openapi`）
- [ ] OpenAPI 验证通过（`npm run validate:openapi`）
- [ ] 前端类型已生成
- [ ] 后端 Schema 已创建
- [ ] 后端路由已实现
- [ ] 后端路由已注册到 `main.py`
- [ ] 前端 API 客户端已创建
- [ ] 后端测试已编写并通过
- [ ] 前端测试已编写并通过
- [ ] 手动测试通过

---

## 常见问题

### Q: 应该在哪个模块添加 API？

**A**: 根据功能选择：
- 用户相关 → `auth`
- 对话相关 → `chat`
- 文件相关 → `files`
- 生成相关 → `generate`
- 项目/课程相关 → `project`
- 知识库相关 → `rag`

### Q: 如何处理认证？

**A**: 在 OpenAPI 中添加 `security`：

```yaml
security:
 - BearerAuth: []
```

在后端使用 `Depends(get_current_user)`：

```python
async def create_course(
 request: CreateCourseRequest,
 current_user = Depends(get_current_user)
):
 # current_user 包含当前用户信息
```

### Q: 如何处理错误？

**A**: 使用标准错误响应：

```yaml
responses:
 '400':
 $ref: '../components/responses.yaml#/components/responses/BadRequest'
 '401':
 $ref: '../components/responses.yaml#/components/responses/Unauthorized'
```

后端抛出 HTTPException：

```python
raise HTTPException(status_code=400, detail="错误信息")
```

---

## 相关文档

- `.ai/guides/api-workflow.md` - API 开发完整流程
- `docs/standards/backend.md` - 后端代码规范
- `docs/standards/frontend.md` - 前端代码规范


