# Spectra AI Context

> 最后更新：2026-02-26 | 版本：1.0

## 快速开始（必读）

**项目类型**：Monorepo（前端 + 后端分离）
**技术栈**：Next.js 15 + FastAPI + Prisma ORM
**架构模式**：Contract-First（OpenAPI 驱动开发）
**AI 模型**：阿里云通义千问（DashScope）

### 核心特性
- 多模态 AI 教学助手（PPT/Word 生成）
- RAG 知识库（向量检索）
- 模块化 OpenAPI 规范（拆分为 50-150 行小文件）

---

## 目录结构速查

| 功能 | 路径 | 说明 |
|------|------|------|
| 前端应用 | `frontend/` | Next.js 15 + TypeScript + Tailwind |
| 后端 API | `backend/` | FastAPI + Python 3.11 |
| API 规范（模块） | `docs/openapi/paths/` | 按功能拆分的 API 定义 |
| 数据模型（模块） | `docs/openapi/schemas/` | 按功能拆分的数据模型 |
| 架构文档 | `docs/architecture/` | 系统设计和技术决策 |
| 开发规范 | `docs/standards/` | 代码规范和最佳实践 |
| AI 指南 | `.ai/guides/` | 任务驱动的操作指南 |

### 关键文件
- `docs/openapi-source.yaml` - OpenAPI 主文件（引用模块）
- `docs/openapi.yaml` - 打包后的完整规范（⚠️ 自动生成，不要直接读取）
- `backend/main.py` - FastAPI 应用入口
- `frontend/app/page.tsx` - Next.js 首页

---

## 任务类型索引

### 🎨 前端开发
**必读**：
- `.ai/guides/creating-component.md` - 组件创建指南
- `docs/standards/frontend.md` - 前端规范
- `frontend/README.md` - 前端项目说明

**技术栈**：
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS + Shadcn/ui
- Zustand (状态管理)

**常用命令**：
```bash
cd frontend
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本
npm run test         # 运行测试
```

### ⚙️ 后端开发
**必读**：
- `.ai/guides/code-organization.md` - 代码组织规范（必读）
- `.ai/guides/adding-api-endpoint.md` - API 端点添加指南
- `docs/standards/backend.md` - 后端规范
- `backend/README.md` - 后端项目说明

**技术栈**：
- FastAPI
- Python 3.11
- Prisma ORM (SQLite)
- DashScope (阿里云 AI)

**常用命令**：
```bash
cd backend
python -m venv venv
source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
uvicorn main:app --reload  # 启动开发服务器
pytest                     # 运行测试
```

### 🔌 API 修改
**必读**：
- `.ai/guides/api-workflow.md` - API 开发完整流程
- `docs/openapi/README.md` - OpenAPI 使用指南

**⚠️ 重要**：
- ✅ 读取 `docs/openapi/paths/{模块}.yaml` 和 `docs/openapi/schemas/{模块}.yaml`
- ❌ 不要读取 `docs/openapi.yaml`（1200+ 行，自动生成）

**工作流程**：
1. 编辑模块文件（`docs/openapi/paths/` 或 `docs/openapi/schemas/`）
2. 运行 `npm run bundle:openapi` 打包
3. 运行 `npm run validate:openapi` 验证
4. 生成前端类型：`cd frontend && npx openapi-typescript ../docs/openapi.yaml -o lib/types/api.ts`

### 📝 文档编写
**必读**：
- `docs/standards/documentation.md` - 文档规范
- `.ai/guides/best-practices.md` - 最佳实践

**文档类型**：
- `.ai/` - AI 专用（简洁、任务驱动）
- `docs/` - 人类阅读（详细、理念说明）

---

## OpenAPI 快速索引

| 功能模块 | 路径定义 | 数据模型 |
|---------|---------|---------|
| 认证 | `docs/openapi/paths/auth.yaml` | `docs/openapi/schemas/auth.yaml` |
| 聊天 | `docs/openapi/paths/chat.yaml` | `docs/openapi/schemas/chat.yaml` |
| 文件上传 | `docs/openapi/paths/files.yaml` | `docs/openapi/schemas/files.yaml` |
| 内容生成 | `docs/openapi/paths/generate.yaml` | `docs/openapi/schemas/generate.yaml` |
| 预览 | `docs/openapi/paths/preview.yaml` | `docs/openapi/schemas/preview.yaml` |
| 项目管理 | `docs/openapi/paths/project.yaml` | `docs/openapi/schemas/project.yaml` |
| RAG 知识库 | `docs/openapi/paths/rag.yaml` | `docs/openapi/schemas/rag.yaml` |

**公共组件**：
- `docs/openapi/components/parameters.yaml` - 通用参数
- `docs/openapi/components/responses.yaml` - 通用响应
- `docs/openapi/components/security.yaml` - 安全定义

---

## 技术决策（ADR）索引

| 主题 | ADR 文件 | 关键决策 |
|------|---------|---------|
| 前端框架 | `docs/decisions/001-frontend-framework.md` | 选择 Next.js 15 |
| 后端框架 | `docs/decisions/002-backend-framework.md` | 选择 FastAPI |
| 数据库 | `docs/decisions/003-database.md` | 选择 Prisma + SQLite |
| LLM 选型 | `docs/decisions/004-llm-selection.md` | 选择通义千问 |
| 向量数据库 | `docs/decisions/006-vector-database.md` | 选择 Chroma |
| OpenAPI 模块化 | `docs/decisions/ADR-003-openapi-modularization.md` | 拆分为小文件 |

---

## 常见问题（快速索引）

详细答案见 `.ai/FAQ.md`

1. **前端和后端在哪里？** → `frontend/` 和 `backend/`
2. **我应该读取哪个 OpenAPI 文件？** → 读取 `docs/openapi/{paths|schemas}/{模块}.yaml`
3. **如何修改 API？** → 参考 `.ai/guides/api-workflow.md`
4. **如何添加新组件？** → 参考 `.ai/guides/creating-component.md`
5. **如何运行测试？** → 前端：`npm run test`，后端：`pytest`
6. **如何提交代码？** → 遵循 Conventional Commits 格式
7. **遇到编译错误怎么办？** → 参考 `.ai/guides/troubleshooting.md`
8. **如何查看架构设计？** → 参考 `docs/architecture/README.md`

---

## 规则优先级

当规则冲突时，按以下顺序应用：

1. **OpenAPI 规范** (`docs/openapi/`) - API 契约，最高优先级
2. **代码规范** (`docs/standards/`) - 编码标准和最佳实践
3. **任务指南** (`.ai/guides/`) - 具体操作步骤
4. **全局规约** (`.cursorrules`) - 项目级通用规则
5. **子目录规约** (`frontend/.cursorrules`, `backend/.cursorrules`) - 领域特定规则

---

## 工作流程建议

### 第一次使用
1. 阅读本文档（`.ai/CONTEXT.md`）
2. 根据任务类型找到对应指南
3. 使用 `.ai/self-check.md` 验证理解

### 执行任务
1. 识别任务类型（前端/后端/API/文档）
2. 阅读"必读"文档
3. 按照指南步骤执行
4. 运行验证命令
5. 提交代码

### 遇到问题
1. 查看 `.ai/FAQ.md`
2. 查看 `.ai/guides/troubleshooting.md`
3. 向用户确认

---

## Kiro IDE 特定功能

如果你在 Kiro IDE 中工作：

### Spec 驱动开发
- Spec 文件位置：`.kiro/specs/{feature-name}/`
- 包含：`requirements.md`（需求）、`design.md`（设计）、`tasks.md`（任务）
- 点击任务旁的 "Start task" 按钮执行

### Steering 规则
- 位置：`.kiro/steering/project-rules.md`
- 使用 `inclusion: always` 总是包含
- 使用 `#[[file:path]]` 引用其他文件

### Context Keys
- `#File:path` - 引用特定文件
- `#Folder:path` - 引用整个文件夹
- `#Codebase` - 扫描整个代码库

### Agent Hooks
- 查看：Explorer → "Agent Hooks"
- 或命令面板 → "Open Kiro Hook UI"
- 可自动化保存时运行测试等任务

---

## 自检清单

使用 `.ai/self-check.md` 验证你是否正确理解了项目结构和规范。

---

## 更新记录

查看 `.ai/CHANGELOG.md` 了解最新变更。
