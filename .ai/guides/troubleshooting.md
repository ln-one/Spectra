# 故障排查指南

> 最后更新：2026-02-26 | 版本：1.0  
> 任务类型：all | 预估 tokens：500

## 前端常见问题

### 编译错误

#### 错误：Module not found

```
Error: Module not found: Can't resolve '@/components/Button'
```

**原因**：导入路径错误或文件不存在

**解决方案**：
1. 检查文件路径是否正确
2. 检查文件名大小写（区分大小写）
3. 检查 `tsconfig.json` 中的路径别名配置

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

#### 错误：Type error

```
Type 'string' is not assignable to type 'number'
```

**原因**：TypeScript 类型不匹配

**解决方案**：
1. 检查变量类型定义
2. 使用类型转换：`Number(value)` 或 `String(value)`
3. 更新接口定义

### 运行时错误

#### 错误：Hydration failed

```
Error: Hydration failed because the initial UI does not match what was rendered on the server
```

**原因**：服务端渲染和客户端渲染不一致

**解决方案**：
1. 避免在组件中使用 `window` 或 `document`（使用 `useEffect`）
2. 确保服务端和客户端的数据一致
3. 使用 `'use client'` 标记客户端组件

```typescript
'use client';

import { useEffect, useState } from 'react';

export function MyComponent() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return <div>{window.innerWidth}</div>;
}
```

#### 错误：Cannot read property of undefined

```
TypeError: Cannot read property 'name' of undefined
```

**原因**：访问未定义的对象属性

**解决方案**：
1. 使用可选链：`user?.name`
2. 提供默认值：`user?.name || 'Unknown'`
3. 添加条件检查：`if (user) { ... }`

### API 调用错误

#### 错误：Network Error

```
Error: Network Error
```

**原因**：无法连接到后端服务

**解决方案**：
1. 检查后端服务是否启动（`http://localhost:8000`）
2. 检查 API 基础 URL 配置
3. 检查 CORS 配置

```typescript
// frontend/lib/api/client.ts
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
});
```

#### 错误：401 Unauthorized

```
Error: Request failed with status code 401
```

**原因**：未认证或 token 过期

**解决方案**：
1. 检查是否已登录
2. 检查 token 是否有效
3. 重新登录获取新 token

```typescript
// 在请求拦截器中添加 token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

---

## 后端常见问题

### 导入错误

#### 错误：ModuleNotFoundError

```
ModuleNotFoundError: No module named 'fastapi'
```

**原因**：依赖未安装

**解决方案**：
```bash
pip install -r requirements.txt
```

#### 错误：ImportError

```
ImportError: cannot import name 'router' from 'routers.auth'
```

**原因**：导入路径错误或循环导入

**解决方案**：
1. 检查导入路径
2. 检查是否存在循环导入
3. 使用绝对导入而非相对导入

### 数据库错误

#### 错误：Prisma Client not generated

```
Error: Prisma Client is not generated
```

**原因**：Prisma 客户端未生成

**解决方案**：
```bash
cd backend
npx prisma generate
```

#### 错误：Database connection failed

```
Error: Can't reach database server
```

**原因**：数据库连接失败

**解决方案**：
1. 检查数据库文件是否存在（`backend/prisma/dev.db`）
2. 运行数据库迁移：`npx prisma migrate dev`
3. 检查 `.env` 中的数据库 URL

### API 错误

#### 错误：422 Unprocessable Entity

```
{
  "detail": [
    {
      "loc": ["body", "title"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

**原因**：请求数据不符合 Pydantic 模型

**解决方案**：
1. 检查请求体是否包含所有必填字段
2. 检查字段类型是否正确
3. 检查 Pydantic 模型定义

```python
class CreateCourseRequest(BaseModel):
    title: str  # 必填
    description: Optional[str] = None  # 可选
```

#### 错误：500 Internal Server Error

**原因**：服务器内部错误

**解决方案**：
1. 查看后端日志
2. 检查异常堆栈
3. 添加 try-except 捕获异常

```python
try:
    result = await some_operation()
    return {"success": True, "data": result}
except Exception as e:
    logger.error(f"Error: {str(e)}")
    raise HTTPException(status_code=500, detail=str(e))
```

---

## OpenAPI 相关问题

### 打包错误

#### 错误：Cannot resolve reference

```
Error: Cannot resolve reference: ../schemas/auth.yaml#/components/schemas/LoginRequest
```

**原因**：引用路径错误或文件不存在

**解决方案**：
1. 检查引用路径（`../schemas/` 而非 `./schemas/`）
2. 确保被引用的文件存在
3. 检查 schema 名称是否正确

```yaml
# 正确的引用
$ref: '../schemas/auth.yaml#/components/schemas/LoginRequest'

# 错误的引用
$ref: './schemas/auth.yaml#/components/schemas/LoginRequest'
```

### 验证错误

#### 错误：Schema validation failed

```
Error: Schema validation failed
```

**原因**：OpenAPI 规范不符合标准

**解决方案**：
1. 检查 YAML 语法（缩进、冒号）
2. 检查必填字段
3. 使用在线验证工具：https://editor.swagger.io/

### 类型生成错误

#### 错误：Cannot generate types

```
Error: Failed to generate types
```

**原因**：OpenAPI 规范有误或未打包

**解决方案**：
1. 运行 `npm run bundle:openapi`
2. 运行 `npm run validate:openapi`
3. 检查 `docs/openapi.yaml` 是否存在

---

## 开发环境问题

### 依赖安装问题

#### 错误：npm install failed

```
Error: EACCES: permission denied
```

**原因**：权限不足

**解决方案**：
```bash
# macOS/Linux
sudo chown -R $(whoami) ~/.npm
npm install

# 或使用 nvm 管理 Node.js 版本
```

#### 错误：pip install failed

```
Error: Could not find a version that satisfies the requirement
```

**原因**：Python 版本不匹配或包不存在

**解决方案**：
1. 检查 Python 版本（需要 3.11）
2. 更新 pip：`pip install --upgrade pip`
3. 使用虚拟环境

### 端口占用问题

#### 错误：Port already in use

```
Error: Port 3000 is already in use
```

**原因**：端口被占用

**解决方案**：
```bash
# macOS/Linux
lsof -ti:3000 | xargs kill -9

# 或使用其他端口
PORT=3001 npm run dev
```

### 环境变量问题

#### 错误：Environment variable not found

```
Error: NEXT_PUBLIC_API_URL is not defined
```

**原因**：环境变量未设置

**解决方案**：
1. 创建 `.env.local` 文件
2. 添加必要的环境变量
3. 重启开发服务器

```bash
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000

# backend/.env
DATABASE_URL="file:./prisma/dev.db"
DASHSCOPE_API_KEY=your_api_key
```

---

## 调试技巧

### 前端调试

```typescript
// 使用 console.log
console.log('Debug:', data);

// 使用 debugger
debugger;

// 使用 React DevTools
// 安装浏览器扩展：React Developer Tools
```

### 后端调试

```python
# 使用 print
print(f"Debug: {data}")

# 使用 logger
from utils.logger import logger
logger.debug(f"Debug: {data}")

# 使用 pdb
import pdb; pdb.set_trace()
```

### 网络调试

1. 打开浏览器开发者工具（F12）
2. 切换到 Network 标签
3. 查看请求和响应
4. 检查状态码、请求头、响应体

---

## 获取帮助

### 查看日志

**前端**：
- 浏览器控制台（F12）
- Next.js 终端输出

**后端**：
- FastAPI 终端输出
- 日志文件（如果配置）

### 查看文档

- `.ai/CONTEXT.md` - 项目概览
- `.ai/FAQ.md` - 常见问题
- `docs/architecture/` - 架构文档
- `docs/standards/` - 代码规范

### 寻求帮助

1. 查看错误堆栈
2. 搜索错误信息
3. 查看相关文档
4. 向团队成员询问
