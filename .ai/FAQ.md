# 常见问题

> 最后更新：2026-02-26

## 项目结构

### Q: 前端和后端在哪里？
**A**: 
- 前端：`frontend/` 目录（Next.js 15 + TypeScript）
- 后端：`backend/` 目录（FastAPI + Python 3.11）

### Q: API 规范在哪里？
**A**: 
- **模块化文件**（推荐读取）：`docs/openapi/paths/` 和 `docs/openapi/schemas/`
- **打包文件**（自动生成，不要直接读取）：`docs/openapi.yaml`

### Q: 文档在哪里？
**A**:
- AI 专用指南：`.ai/` 目录
- 人类阅读文档：`docs/` 目录
- 架构设计：`docs/architecture/`
- 代码规范：`docs/standards/`

### Q: 如何找到特定功能的代码？
**A**: 参考 `.ai/CONTEXT.md` 中的"目录结构速查"表格。

---

## OpenAPI

### Q: 我应该读取哪个 OpenAPI 文件？
**A**: 
- ✅ **应该读取**：`docs/openapi/paths/{模块}.yaml` 和 `docs/openapi/schemas/{模块}.yaml`
- ❌ **不要读取**：`docs/openapi.yaml`（1200+ 行，自动生成的打包文件）

**原因**：模块文件只有 50-150 行，更容易理解和修改。

### Q: 如何修改 API？
**A**: 按照以下步骤：
1. 编辑 `docs/openapi/paths/{模块}.yaml` 或 `docs/openapi/schemas/{模块}.yaml`
2. 运行 `npm run bundle:openapi` 打包
3. 运行 `npm run validate:openapi` 验证
4. 生成前端类型：`cd frontend && npx openapi-typescript ../docs/openapi.yaml -o lib/types/api.ts`

详细流程参考：`.ai/guides/api-workflow.md`

### Q: 如何添加新的 API 端点？
**A**: 参考 `.ai/guides/adding-api-endpoint.md`

关键步骤：
1. 在对应模块的 `paths/{模块}.yaml` 中定义路径
2. 在 `schemas/{模块}.yaml` 中定义数据模型
3. 实现后端处理器（`backend/routers/`）
4. 实现前端调用（`frontend/lib/api/`）
5. 编写测试

### Q: 如何验证 API 规范？
**A**: 运行以下命令：
```bash
npm run validate:openapi
```

如果验证失败，检查：
- YAML 语法是否正确
- 引用路径是否存在
- 数据类型是否匹配

---

## 开发流程

### Q: 如何启动开发环境？
**A**: 

**前端**：
```bash
cd frontend
npm install
npm run dev  # 访问 http://localhost:3000
```

**后端**：
```bash
cd backend
python -m venv venv
source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
uvicorn main:app --reload  # 访问 http://localhost:8000
```

### Q: 如何运行测试？
**A**:

**前端**：
```bash
cd frontend
npm run test
```

**后端**：
```bash
cd backend
pytest
```

### Q: 如何提交代码？
**A**: 遵循 Conventional Commits 格式：
```
<type>(<scope>): <subject>

type: feat | fix | refactor | docs | style | test | chore
scope: frontend | backend | api | docs
```

示例：
```
feat(frontend): 添加用户登录页面
fix(backend): 修复文件上传错误
docs(api): 更新认证接口文档
```

### Q: 如何创建新组件？
**A**: 参考 `.ai/guides/creating-component.md`

基本步骤：
1. 在 `frontend/components/` 创建组件文件
2. 使用 Shadcn/ui 组件库
3. 遵循命名规范（PascalCase）
4. 编写 TypeScript 类型
5. 添加测试

### Q: 如何添加新的后端服务？
**A**: 
1. 在 `backend/services/` 创建服务文件
2. 在 `backend/routers/` 创建路由文件
3. 在 `backend/main.py` 中注册路由
4. 更新 OpenAPI 规范
5. 编写测试

---

## 常见错误

### Q: 遇到编译错误怎么办？
**A**: 参考 `.ai/guides/troubleshooting.md`

常见问题：
- **前端**：检查 TypeScript 类型、导入路径
- **后端**：检查 Python 导入、依赖版本
- **API**：检查 OpenAPI 规范是否有效

### Q: API 调用失败怎么办？
**A**: 检查以下内容：
1. 后端服务是否启动
2. API 路径是否正确
3. 请求参数是否匹配 OpenAPI 定义
4. 认证 token 是否有效
5. 查看浏览器控制台和后端日志

### Q: 数据库错误怎么办？
**A**: 
1. 检查 Prisma schema 是否正确
2. 运行 `npx prisma generate` 生成客户端
3. 运行 `npx prisma migrate dev` 应用迁移
4. 检查数据库文件权限

### Q: 依赖安装失败怎么办？
**A**:
- **前端**：删除 `node_modules` 和 `package-lock.json`，重新运行 `npm install`
- **后端**：确保使用 Python 3.11，重新创建虚拟环境

---

## 架构和设计

### Q: 如何查看系统架构？
**A**: 参考以下文档：
- 系统概览：`docs/architecture/system/overview.md`
- 前端架构：`docs/architecture/frontend/overview.md`
- 后端架构：`docs/architecture/backend/overview.md`
- 数据流：`docs/architecture/system/data-flow.md`

### Q: 为什么选择这些技术？
**A**: 查看技术决策记录（ADR）：
- `docs/decisions/001-frontend-framework.md` - 为什么选择 Next.js
- `docs/decisions/002-backend-framework.md` - 为什么选择 FastAPI
- `docs/decisions/004-llm-selection.md` - 为什么选择通义千问

### Q: 如何理解 Contract-First 开发？
**A**: 
1. 先定义 OpenAPI 规范（API 契约）
2. 生成前端类型定义
3. 实现后端 API
4. 实现前端调用
5. 确保前后端一致

参考：`docs/architecture/api-contract.md`

---

## 最佳实践

### Q: 代码规范在哪里？
**A**:
- 前端规范：`docs/standards/frontend.md`
- 后端规范：`docs/standards/backend.md`
- 文档规范：`docs/standards/documentation.md`
- Git 规范：`docs/standards/git.md`

### Q: 如何编写好的 commit message？
**A**: 参考 `docs/standards/git.md`

要点：
- 使用 Conventional Commits 格式
- 第一行不超过 50 字符
- 使用祈使语气（"添加"而非"添加了"）
- 说明"做了什么"和"为什么"

### Q: 如何编写测试？
**A**: 参考 `docs/guides/testing.md`

原则：
- 单元测试：测试单个函数/组件
- 集成测试：测试多个模块协作
- E2E 测试：测试完整用户流程

---

## AI 协作

### Q: 我是 AI，应该从哪里开始？
**A**: 
1. 阅读 `.ai/CONTEXT.md`（本文档的入口）
2. 根据任务类型找到对应指南
3. 使用 `.ai/self-check.md` 验证理解

### Q: 如何知道应该读取哪些文档？
**A**: 
- `.ai/CONTEXT.md` 中的"任务类型索引"明确标注了"必读"和"可选"文档
- 每个任务指南（`.ai/guides/`）也会列出必读文件

### Q: 文档太多，如何避免读取不必要的内容？
**A**: 
- 使用渐进式加载：先读 `.ai/CONTEXT.md`，再按需深入
- 只读取任务相关的模块文件，不要读取完整的打包文件
- 参考文档头部的元数据（任务类型、预估 tokens）

### Q: 如何验证我的理解是否正确？
**A**: 使用 `.ai/self-check.md` 中的检查清单。

---

## 工具特定

### Q: 我是 Cursor，有特殊配置吗？
**A**: 目前没有单独的 Cursor 配置，请按 `.ai/` 目录下的通用说明使用本项目。如需新增 Cursor 特定配置，请在 `.ai/` 中补充相应文档，并更新 `.ai/CHANGELOG.md`。

### Q: 我是 Kiro，有特殊配置吗？
**A**: 目前没有单独的 Kiro 配置，请按 `.ai/` 目录下的通用说明使用本项目。如需新增 Kiro 特定配置，请在 `.ai/` 中补充相应文档，并更新 `.ai/CHANGELOG.md`。

### Q: 我是其他 AI 工具，如何适配？
**A**: 
- 所有 `.ai/` 目录下的文档使用标准 Markdown，无工具特定语法
- 如需工具特定配置，可以新增相应文档（例如 `tool-<name>.md`），并在 `.ai/CHANGELOG.md` 中记录变更

---

## 其他

### Q: 如何更新文档？
**A**: 
1. 编辑对应的 Markdown 文件
2. 更新文件头部的"最后更新"时间
3. 在 `.ai/CHANGELOG.md` 中记录变更
4. 提交代码

### Q: 发现文档错误怎么办？
**A**: 
1. 直接修改文档
2. 提交 PR 并说明错误
3. 或者向项目维护者报告

### Q: 如何贡献代码？
**A**: 参考 `docs/CONTRIBUTING.md`

基本流程：
1. Fork 项目
2. 创建功能分支
3. 编写代码和测试
4. 提交 PR
5. 等待 review
