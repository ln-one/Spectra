# API 开发工作流程

> 最后更新：2026-02-26 | 版本：1.0 
> 任务类型：api | 预估 tokens：600

## 适用场景

- 添加新的 API 端点
- 修改现有 API
- 查看 API 定义

---

## 必读文件

根据你要操作的模块，读取对应的文件：

| 模块 | 路径定义 | 数据模型 |
|------|---------|---------|
| 认证 | `docs/openapi/paths/auth.yaml` | `docs/openapi/schemas/auth.yaml` |
| 聊天 | `docs/openapi/paths/chat.yaml` | `docs/openapi/schemas/chat.yaml` |
| 文件 | `docs/openapi/paths/files.yaml` | `docs/openapi/schemas/files.yaml` |
| 生成 | `docs/openapi/paths/generate.yaml` | `docs/openapi/schemas/generate.yaml` |
| 预览 | `docs/openapi/paths/preview.yaml` | `docs/openapi/schemas/preview.yaml` |
| 项目 | `docs/openapi/paths/project.yaml` | `docs/openapi/schemas/project.yaml` |
| RAG | `docs/openapi/paths/rag.yaml` | `docs/openapi/schemas/rag.yaml` |

** 重要**：不要读取 `docs/openapi.yaml`（1200+ 行，自动生成）

---

## 完整工作流程

### 1. 查看现有 API（如果修改）

```bash
# 示例：查看认证相关 API
cat docs/openapi/paths/auth.yaml
cat docs/openapi/schemas/auth.yaml
```

**查看内容**：
- API 路径和方法
- 请求参数
- 响应格式
- 错误码

### 2. 编辑模块文件

**编辑路径定义**（`docs/openapi/paths/{模块}.yaml`）：

```yaml
/api/v1/auth/login:
 post:
 summary: 用户登录
 tags:
 - auth
 requestBody:
 required: true
 content:
 application/json:
 schema:
 $ref: '../schemas/auth.yaml#/components/schemas/LoginRequest'
 responses:
 '200':
 description: 登录成功
 content:
 application/json:
 schema:
 $ref: '../schemas/auth.yaml#/components/schemas/LoginResponse'
```

**编辑数据模型**（`docs/openapi/schemas/{模块}.yaml`）：

```yaml
components:
 schemas:
 LoginRequest:
 type: object
 required:
 - username
 - password
 properties:
 username:
 type: string
 password:
 type: string
 format: password
```

### 3. 打包和验证

```bash
# 打包模块文件到 docs/openapi.yaml
npm run bundle:openapi

# 验证 OpenAPI 规范
npm run validate:openapi
```

**预期输出**：
```
 OpenAPI specification is valid
```

**如果验证失败**：
- 检查 YAML 语法
- 检查引用路径（`$ref`）
- 检查数据类型

### 4. 生成前端类型

```bash
cd frontend
npx openapi-typescript ../docs/openapi.yaml -o lib/types/api.ts
```

**生成的类型**：
```typescript
export interface LoginRequest {
 username: string;
 password: string;
}

export interface LoginResponse {
 success: boolean;
 data: {
 token: string;
 user: User;
 };
}
```

### 5. 实现后端

**创建路由**（`backend/routers/auth.py`）：

```python
from fastapi import APIRouter, HTTPException
from schemas.auth import LoginRequest, LoginResponse

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
 # 实现登录逻辑
 user = await auth_service.authenticate(request.username, request.password)
 if not user:
 raise HTTPException(status_code=401, detail="Invalid credentials")
 
 token = await auth_service.create_token(user)
 return LoginResponse(
 success=True,
 data={"token": token, "user": user}
 )
```

**创建 Schema**（`backend/schemas/auth.py`）：

```python
from pydantic import BaseModel

class LoginRequest(BaseModel):
 username: str
 password: str

class LoginResponse(BaseModel):
 success: bool
 data: dict
```

**注册路由**（`backend/main.py`）：

```python
from routers import auth

app.include_router(auth.router)
```

### 6. 实现前端

**创建 API 客户端**（`frontend/lib/api/auth.ts`）：

```typescript
import { apiClient } from './client';
import type { LoginRequest, LoginResponse } from '../types/api';

export const authApi = {
 login: async (data: LoginRequest): Promise<LoginResponse> => {
 const response = await apiClient.post('/api/v1/auth/login', data);
 return response.data;
 },
};
```

**使用 API**（组件中）：

```typescript
import { authApi } from '@/lib/api/auth';

const handleLogin = async () => {
 try {
 const response = await authApi.login({ username, password });
 if (response.success) {
 // 处理成功
 }
 } catch (error) {
 // 处理错误
 }
};
```

### 7. 测试

**后端测试**（`backend/tests/test_auth_api.py`）：

```python
def test_login_success(client):
 response = client.post("/api/v1/auth/login", json={
 "username": "test",
 "password": "password"
 })
 assert response.status_code == 200
 assert response.json()["success"] is True
```

**前端测试**（`frontend/__tests__/auth.test.ts`）：

```typescript
import { authApi } from '@/lib/api/auth';

test('login success', async () => {
 const response = await authApi.login({
 username: 'test',
 password: 'password'
 });
 expect(response.success).toBe(true);
});
```

---

## 常见错误

### 错误 1：打包失败

**错误信息**：
```
Error: Cannot resolve reference: ../schemas/auth.yaml#/components/schemas/LoginRequest
```

**解决方案**：
- 检查引用路径是否正确
- 确保被引用的 schema 存在
- 检查相对路径（`../schemas/` 而非 `./schemas/`）

### 错误 2：验证失败

**错误信息**：
```
Error: Schema validation failed
```

**解决方案**：
- 检查 YAML 语法（缩进、冒号）
- 检查必填字段（`required`）
- 检查数据类型（`type`）

### 错误 3：类型生成失败

**错误信息**：
```
Error: Cannot generate types
```

**解决方案**：
- 确保 `docs/openapi.yaml` 已打包
- 确保 OpenAPI 规范有效
- 重新运行 `npm run bundle:openapi`

### 错误 4：后端实现不匹配

**错误信息**：
```
422 Unprocessable Entity
```

**解决方案**：
- 检查 Pydantic 模型是否与 OpenAPI schema 一致
- 检查字段名称和类型
- 检查必填字段

### 错误 5：前端调用失败

**错误信息**：
```
404 Not Found
```

**解决方案**：
- 检查 API 路径是否正确
- 确保后端路由已注册
- 检查后端服务是否启动

---

## 验证清单

完成 API 开发后，检查以下内容：

- [ ] OpenAPI 模块文件已编辑
- [ ] 运行 `npm run bundle:openapi` 成功
- [ ] 运行 `npm run validate:openapi` 成功
- [ ] 前端类型已生成
- [ ] 后端路由已实现
- [ ] 后端 Schema 已创建
- [ ] 前端 API 客户端已实现
- [ ] 后端测试已编写并通过
- [ ] 前端测试已编写并通过
- [ ] API 文档已更新（如需要）

---

## 快速参考

### 常用命令

```bash
# 打包 OpenAPI
npm run bundle:openapi

# 验证 OpenAPI
npm run validate:openapi

# 生成前端类型
cd frontend && npx openapi-typescript ../docs/openapi.yaml -o lib/types/api.ts

# 启动后端
cd backend && uvicorn main:app --reload

# 启动前端
cd frontend && npm run dev

# 运行后端测试
cd backend && pytest

# 运行前端测试
cd frontend && npm run test
```

### 文件路径速查

| 内容 | 路径 |
|------|------|
| OpenAPI 路径 | `docs/openapi/paths/{模块}.yaml` |
| OpenAPI Schema | `docs/openapi/schemas/{模块}.yaml` |
| 后端路由 | `backend/routers/{模块}.py` |
| 后端 Schema | `backend/schemas/{模块}.py` |
| 前端 API | `frontend/lib/api/{模块}.ts` |
| 前端类型 | `frontend/lib/types/api.ts` |
| 后端测试 | `backend/tests/test_{模块}_api.py` |
| 前端测试 | `frontend/__tests__/{模块}.test.ts` |

---

## 相关文档

- `.ai/guides/adding-api-endpoint.md` - 添加新 API 端点的详细指南
- `docs/standards/backend.md` - 后端代码规范
- `docs/standards/frontend.md` - 前端代码规范
- `docs/openapi/README.md` - OpenAPI 使用指南
