# 后端 OpenAPI 同步说明

## 📋 背景

Spectra 项目中存在两个 OpenAPI 规范来源：

1. **设计文档**：`docs/openapi/` - 模块化的设计文件（给开发者和 AI 看）
2. **自动生成**：FastAPI 自动生成的 OpenAPI（访问 `/openapi.json`）

## 🎯 目标

确保设计文档和实际实现保持一致，同时保持文档的可读性和可维护性。

## 🔄 工作流程

```
┌─────────────────┐
│ docs/openapi/   │  ← AI 和开发者参照这里（50-150行/文件）
│ (设计文档)      │
└────────┬────────┘
         │ 参照设计
         ↓
┌─────────────────┐
│ backend/routers/│  ← 实现 FastAPI 路由
│ (代码实现)      │
└────────┬────────┘
         │ 自动生成
         ↓
┌─────────────────┐
│ /openapi.json   │  ← FastAPI 自动生成（实际规范）
│ (运行时生成)    │
└────────┬────────┘
         │ 定期对比
         ↓
┌─────────────────┐
│ 同步检查        │  ← 确保一致性
└─────────────────┘
```

## 🛠️ 开发步骤

### 1. 查看设计（AI 和开发者）

```bash
# ✅ 读取模块化的设计文档
cat docs/openapi/paths/auth.yaml      # 80行
cat docs/openapi/schemas/auth.yaml    # 90行

# ❌ 不要读取打包后的大文件
cat docs/openapi.yaml                 # 1266行
```

### 2. 实现代码

```python
# backend/routers/auth.py
# 参照 docs/openapi/paths/auth.yaml 实现

@router.post("/api/v1/auth/register")
async def register(request: RegisterRequest):
    """用户注册"""
    pass
```

### 3. 验证实现

```bash
# 启动服务
cd backend && uvicorn main:app --reload

# 访问自动生成的文档
open http://localhost:8000/docs
```

### 4. 同步检查

```bash
# 运行同步检查脚本
npm run sync:openapi

# 对比差异
# - FastAPI 生成: /tmp/fastapi-openapi.json
# - 设计文档: docs/openapi.yaml
```

### 5. 更新文档（如有差异）

```bash
# 编辑设计文档
vim docs/openapi/paths/auth.yaml

# 重新打包
npm run bundle:openapi
```

## 📝 最佳实践

### 新增接口

1. **设计先行**：在 `docs/openapi/` 中定义接口
2. **实现代码**：在 `backend/routers/` 中实现
3. **验证文档**：访问 `/docs` 检查
4. **同步检查**：运行 `npm run sync:openapi`

### 修改接口

1. **更新设计**：修改 `docs/openapi/` 中的定义
2. **更新代码**：修改对应的 router
3. **重新打包**：`npm run bundle:openapi`
4. **验证同步**：`npm run sync:openapi`

## 🔧 工具命令

```bash
# 打包设计文档
npm run bundle:openapi

# 验证设计文档
npm run validate:openapi

# 同步检查（需要后端运行）
npm run sync:openapi

# 自动监听（开发时推荐）
npm run watch:openapi
```

## ⚠️ 注意事项

1. **设计优先**：`docs/openapi/` 是权威设计文档
2. **自动生成**：FastAPI 的 `/docs` 反映实际实现
3. **定期同步**：确保设计和实现不偏离
4. **AI 参照**：AI 应读取 `docs/openapi/` 而非打包文件

## 🎯 为什么这样做？

### 问题
- 原 `openapi.yaml` 1296 行，AI 和人都难以阅读
- FastAPI 自动生成的规范无法直接编辑

### 解决方案
- **设计文档**（`docs/openapi/`）：模块化，易读易维护
- **自动生成**（FastAPI）：保证实现准确
- **定期同步**：确保一致性

### 优势
- ✅ AI 可以快速理解 API 设计（50-150行/文件）
- ✅ 开发者易于维护和更新
- ✅ 利用 FastAPI 自动生成能力
- ✅ 设计和实现双向验证

## 📚 相关文档

- [OpenAPI 使用指南](./OPENAPI_GUIDE.md)
- [后端工作流程](../backend/OPENAPI_WORKFLOW.md)
- [快速参考](./openapi/QUICK_REFERENCE.md)
- [架构决策 ADR-003](./decisions/ADR-003-openapi-modularization.md)
