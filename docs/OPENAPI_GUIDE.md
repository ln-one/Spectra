# OpenAPI 文档使用指南

## 📦 已完成拆分

原来的 1296 行大文件已拆分为：
- **主入口**: `openapi-source.yaml` (70 行)
- **模块文件**: 每个 50-150 行
- **打包输出**: `openapi.yaml` (1266 行，给 FastAPI 使用)

## 🚀 快速开始

### 日常开发流程

```bash
# 1. 编辑拆分后的文件
vim docs/openapi/paths/auth.yaml

# 2. 打包成单文件
npm run bundle:openapi

# 3. 重启 FastAPI 服务（如果需要）
```

### 自动监听模式（推荐）

```bash
# 开启监听，修改后自动打包
npm run watch:openapi
```

## 📝 常见操作

### 添加新接口

1. 在 `docs/openapi/paths/` 下对应模块添加路径
2. 在 `docs/openapi/schemas/` 下添加数据模型
3. 在 `docs/openapi-source.yaml` 中添加引用
4. 运行 `npm run bundle:openapi`

### 修改现有接口

直接编辑对应的小文件，然后重新打包即可。

### 查看 Swagger UI

FastAPI 会自动读取 `docs/openapi.yaml`，访问：
```
http://localhost:8000/docs
```

## ✅ 优势对比

| 项目 | 拆分前 | 拆分后 |
|------|--------|--------|
| 单文件行数 | 1296 行 | 50-150 行 |
| 可读性 | ❌ 难以定位 | ✅ 模块清晰 |
| 协作冲突 | ❌ 频繁冲突 | ✅ 独立编辑 |
| Swagger 兼容 | ✅ | ✅ |
| 维护成本 | ❌ 高 | ✅ 低 |

## 🔧 故障排查

### 打包失败

```bash
# 检查 YAML 语法
npm run bundle:openapi
```

### FastAPI 读取失败

确保 FastAPI 配置指向 `docs/openapi.yaml`（打包后的文件）。

## 📚 文件说明

- `openapi.yaml` - ✅ 打包后的单文件（不要手动编辑）
- `openapi-source.yaml` - 📝 主入口（包含所有引用）
- `openapi/` - 📁 拆分后的模块文件（日常编辑这里）
