# 后端 OpenAPI 工作流程

## 📋 概述

后端使用 **FastAPI 自动生成** OpenAPI 规范，但开发时应参照 `docs/openapi/` 中的模块文件来实现接口。

## 🔄 双向同步

```
docs/openapi/        FastAPI 代码        FastAPI 生成
  (设计文档)    →    (实现)        →    (实际规范)
     ↑                                        ↓
     └────────────── 定期对比同步 ──────────────┘
```

## 🚀 开发流程

### 1. 查看 API 设计

**✅ 正确做法**：
```bash
# 查看模块化的设计文档（50-150行）
cat ../docs/openapi/paths/auth.yaml
cat ../docs/openapi/schemas/auth.yaml
```

**❌ 错误做法**：
```bash
# 不要读取打包后的大文件
cat ../docs/openapi.yaml  # 1266行，难以阅读
```

### 2. 实现接口

根据 `docs/openapi/` 中的定义实现 FastAPI 路由：

```python
# routers/auth.py
from fastapi import APIRouter
from schemas.auth import RegisterRequest, AuthResponse

router = APIRouter(prefix="/api/v1/auth")

@router.post("/register", response_model=AuthResponse)
async def register(request: RegisterRequest):
    """用户注册 - 参照 docs/openapi/paths/auth.yaml"""
    # 实现逻辑
    pass
```

### 3. 验证实现

```bash
# 启动服务
uvicorn main:app --reload

# 访问自动生成的文档
open http://localhost:8000/docs
```

### 4. 同步检查

定期检查 FastAPI 生成的 OpenAPI 和文档是否一致：

```bash
# 运行同步检查脚本
../scripts/sync-openapi.sh

# 对比差异
# FastAPI 生成: /tmp/fastapi-openapi.json
# 文档定义: ../docs/openapi.yaml
```

### 5. 更新文档

如果发现差异，更新 `docs/openapi/` 中的模块文件：

```bash
# 编辑对应模块
vim ../docs/openapi/paths/auth.yaml
vim ../docs/openapi/schemas/auth.yaml

# 重新打包
cd .. && npm run bundle:openapi
```

## 📝 最佳实践

### 新增接口

1. **先设计**：在 `docs/openapi/paths/{模块}.yaml` 中定义接口
2. **后实现**：在 `routers/{模块}.py` 中实现代码
3. **验证**：访问 `/docs` 检查自动生成的文档
4. **同步**：运行 `sync-openapi.sh` 确保一致

### 修改接口

1. **更新设计**：修改 `docs/openapi/` 中的定义
2. **更新代码**：修改对应的 router 和 schema
3. **重新打包**：`npm run bundle:openapi`
4. **验证同步**：运行 `sync-openapi.sh`

### Schema 定义

```python
# schemas/auth.py
from pydantic import BaseModel, EmailStr

class RegisterRequest(BaseModel):
    """对应 docs/openapi/schemas/auth.yaml#/RegisterRequest"""
    email: EmailStr
    password: str
    username: str
    fullName: str | None = None
```

## 🔧 工具命令

```bash
# 查看 API 设计
cat ../docs/openapi/paths/{模块}.yaml

# 启动开发服务器
uvicorn main:app --reload

# 访问自动文档
open http://localhost:8000/docs

# 同步检查
../scripts/sync-openapi.sh

# 更新文档后打包
cd .. && npm run bundle:openapi
```

## ⚠️ 注意事项

1. **设计先行**：先在 `docs/openapi/` 中设计，再实现代码
2. **保持同步**：定期运行 `sync-openapi.sh` 检查一致性
3. **文档优先**：`docs/openapi/` 是权威设计文档
4. **自动生成**：FastAPI 的 `/docs` 是实际实现的反映
5. **双向验证**：设计和实现应该保持一致

## 🎯 为什么这样做？

- **设计文档**（`docs/openapi/`）：给 AI 和开发者看，易读易维护
- **自动生成**（FastAPI `/docs`）：给前端和测试用，保证实现准确
- **定期同步**：确保设计和实现不偏离

这样既保持了文档的可读性，又利用了 FastAPI 的自动生成能力。
