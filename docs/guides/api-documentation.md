# API 文档使用指南

## 访问 API 文档

Spectra 后端提供两种 API 文档界面，都基于 OpenAPI 规范自动生成。

### Swagger UI（推荐用于测试）

**访问地址**: http://localhost:8000/docs

**特点**:
- 交互式文档界面
- 可直接在浏览器中测试 API
- 支持填写参数、发送请求、查看响应
- 自动处理认证 Token

**适用场景**:
- 开发调试
- 快速测试 API
- 验证请求参数
- 查看响应格式

### ReDoc（推荐用于阅读）

**访问地址**: http://localhost:8000/redoc

**特点**:
- 美观的文档展示
- 清晰的结构化布局
- 适合阅读和参考
- 支持搜索和导航

**适用场景**:
- API 参考查阅
- 了解接口设计
- 查看数据模型
- 团队协作沟通

## OpenAPI 规范文件

### 模块化组织

API 定义采用模块化组织，位于 `docs/openapi/` 目录：

```
docs/openapi/
├── paths/ # API 路径定义
│ ├── auth.yaml # 认证相关接口
│ ├── files.yaml # 文件管理接口
│ ├── generate-session.yaml # 课件生成接口索引
│ └── project.yaml # 项目管理接口
├── schemas/ # 数据模型定义
│ ├── auth.yaml
│ ├── files.yaml
│ ├── generate.yaml
│ └── common.yaml
└── components/ # 可复用组件
 ├── parameters.yaml
 ├── responses.yaml
 └── security.yaml
```

### 打包后的文件

完整的 OpenAPI 规范文件：`docs/openapi-target.yaml`

**注意**: 此文件由 Redocly CLI 自动生成，不要手动编辑。

## 使用 Redocly CLI

### 安装依赖

```bash
npm install
```

### 常用命令

```bash
# 打包模块化文档为单一文件
npm run bundle:openapi

# 验证 OpenAPI 规范
npm run validate:openapi

# 监听文件变化自动打包
npm run watch:openapi
```

## 开发工作流

### 1. 定义 API（契约优先）

编辑模块化 OpenAPI 文件：

```bash
# 编辑认证接口
vim docs/openapi/paths/auth.yaml

# 编辑数据模型
vim docs/openapi/schemas/auth.yaml
```

### 2. 打包和验证

```bash
# 打包
npm run bundle:openapi

# 验证
npm run validate:openapi
```

### 3. 查看文档

启动后端服务后访问：
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### 4. 实现代码

根据 OpenAPI 定义实现后端路由：

```python
# backend/routers/auth.py
@router.post("/register")
async def register(request: RegisterRequest):
 # 实现注册逻辑
 pass
```

### 5. 验证一致性

- 访问 `/docs` 查看自动生成的文档
- 确保实现与 OpenAPI 定义一致
- 使用 Swagger UI 测试接口

## 测试 API

### 使用 Swagger UI 测试

1. 访问 http://localhost:8000/docs
2. 找到要测试的接口
3. 点击 "Try it out"
4. 填写请求参数
5. 点击 "Execute"
6. 查看响应结果

### 认证接口测试

对于需要认证的接口：

1. 先调用 `/api/v1/auth/login` 获取 token
2. 点击页面右上角的 "Authorize" 按钮
3. 输入 `Bearer <your_token>`
4. 点击 "Authorize"
5. 现在可以测试需要认证的接口了

## 前端集成

### 生成 TypeScript 类型（可选）

```bash
cd frontend
npx openapi-typescript ../docs/openapi-target.yaml -o lib/sdk/types.ts
```

### 使用生成的类型

```typescript
import type { AuthResponse, RegisterRequest } from '@/lib/types/api';

const response: AuthResponse = await authApi.register(data);
```

## 相关文档

- [API 契约设计](../architecture/api-contract.md)
- [OpenAPI 模块化指南](../openapi/README.md)
- [后端 OpenAPI 同步](../archived/openapi/BACKEND_OPENAPI_SYNC.md)
