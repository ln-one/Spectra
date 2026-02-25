# ADR-003: OpenAPI 规范模块化

## 状态
✅ 已采纳 (2026-02-25)

## 背景
原 `docs/openapi.yaml` 文件达到 1296 行，存在以下问题：
- AI 工具难以读取和理解（token 限制）
- 人工维护困难，定位接口耗时
- 团队协作时容易产生合并冲突
- 单文件过大违反项目规范（<300行）

## 决策
将 OpenAPI 规范拆分为模块化文件结构：

```
docs/
├── openapi.yaml              # 打包后的单文件（自动生成）
├── openapi-source.yaml       # 主入口文件（70行）
└── openapi/
    ├── paths/                # 7个路径文件
    ├── schemas/              # 8个模型文件
    └── components/           # 3个组件文件
```

### 工作流程
1. **开发时**：编辑 `docs/openapi/` 下的小文件（50-150行）
2. **打包**：运行 `npm run bundle:openapi` 生成单文件
3. **使用**：FastAPI/Swagger UI 读取打包后的 `openapi.yaml`

## 优势
- ✅ 每个文件 50-150 行，AI 和人都易读
- ✅ 按模块组织，职责清晰
- ✅ 减少合并冲突
- ✅ 完全兼容现有工具（Swagger UI、Redoc）
- ✅ 自动打包，无需手动合并

## 影响范围

### 更新的文件
- `.kiro/steering/project-rules.md` - AI 工作流程指引
- `backend/.cursorrules` - 后端开发规范
- `frontend/.cursorrules` - 前端开发规范
- `docs/.cursorrules` - 文档维护规范
- `README.md` - 项目说明

### 新增的文件
- `package.json` - 打包工具配置
- `scripts/bundle-openapi.sh` - 打包脚本
- `scripts/validate-openapi.sh` - 验证脚本
- `docs/openapi/` - 模块化文件目录
- `docs/openapi/.cursorrules` - OpenAPI 编辑指南
- `docs/OPENAPI_GUIDE.md` - 使用指南

### AI 工作流程变更
**之前**：
```bash
# AI 读取 1296 行的大文件
cat docs/openapi.yaml
```

**现在**：
```bash
# AI 读取 50-150 行的模块文件
cat docs/openapi/paths/auth.yaml
cat docs/openapi/schemas/auth.yaml
```

## 实施步骤
1. ✅ 创建目录结构
2. ✅ 拆分文件（按模块）
3. ✅ 配置打包工具
4. ✅ 验证功能完整性
5. ✅ 更新项目规范文档
6. ✅ 更新 AI 工作流程指引

## 维护指南

### 日常开发
```bash
# 1. 编辑模块文件
vim docs/openapi/paths/auth.yaml

# 2. 打包
npm run bundle:openapi

# 3. 验证
npm run validate:openapi
```

### 自动监听（推荐）
```bash
npm run watch:openapi
```

### 添加新接口
1. 在 `paths/{模块}.yaml` 添加路径
2. 在 `schemas/{模块}.yaml` 添加模型
3. 在 `openapi-source.yaml` 添加引用
4. 运行打包命令

## 注意事项
- ⚠️ 不要直接编辑 `docs/openapi.yaml`（自动生成）
- ⚠️ 修改后必须运行打包命令
- ⚠️ AI 应读取 `docs/openapi/` 下的文件，而非打包后的大文件
- ⚠️ 提交代码前确保已打包

## 参考资料
- [OpenAPI 最佳实践](https://swagger.io/docs/specification/using-ref/)
- [swagger-cli 文档](https://github.com/APIDevTools/swagger-cli)
- [docs/OPENAPI_GUIDE.md](../OPENAPI_GUIDE.md)
