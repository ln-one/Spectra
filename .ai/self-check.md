# AI 自检清单

> 最后更新：2026-02-26 | 版本：1.0

使用此清单验证你是否正确理解了 Spectra 项目的结构和规范。

---

## 基础理解

- [ ] 我知道这是一个 Monorepo 项目（前端 + 后端分离）
- [ ] 我知道前端在 `frontend/` 目录（Next.js 15 + TypeScript）
- [ ] 我知道后端在 `backend/` 目录（FastAPI + Python 3.11）
- [ ] 我知道这是 Contract-First 开发（OpenAPI 驱动）
- [ ] 我知道项目使用阿里云通义千问作为 AI 模型

---

## 文档理解

- [ ] 我知道 `.ai/CONTEXT.md` 是 AI 的唯一入口文档
- [ ] 我知道 `.ai/` 目录是给 AI 看的（简洁、任务驱动）
- [ ] 我知道 `docs/` 目录是给人类看的（详细、理念说明）
- [ ] 我知道如何根据任务类型找到对应的指南
- [ ] 我知道每个任务指南中标注了"必读"和"可选"文件

---

## OpenAPI 理解

- [ ] 我知道应该读取 `docs/openapi/paths/{模块}.yaml` 和 `docs/openapi/schemas/{模块}.yaml`
- [ ] 我知道不应该读取 `docs/openapi.yaml`（1200+ 行，自动生成）
- [ ] 我知道 OpenAPI 模块包括：auth, chat, files, generate, preview, project, rag
- [ ] 我知道修改 OpenAPI 后需要运行 `npm run bundle:openapi`
- [ ] 我知道如何验证 OpenAPI 规范（`npm run validate:openapi`）
- [ ] 我知道如何生成前端类型（`npx openapi-typescript`）

---

## 任务执行理解

### 前端开发

- [ ] 我知道如何创建 React 组件（参考 `.ai/guides/creating-component.md`）
- [ ] 我知道组件文件使用 PascalCase 命名（如 `CourseCard.tsx`）
- [ ] 我知道何时使用 `'use client'`（需要 hooks 或浏览器 API）
- [ ] 我知道如何使用 Shadcn/ui 组件库
- [ ] 我知道如何使用 Tailwind CSS

### 后端开发

- [ ] 我知道如何添加 API 端点（参考 `.ai/guides/adding-api-endpoint.md`）
- [ ] 我知道路由文件在 `backend/routers/`
- [ ] 我知道 Schema 文件在 `backend/schemas/`
- [ ] 我知道如何使用 Pydantic 定义数据模型
- [ ] 我知道如何在 `main.py` 中注册路由

### API 开发

- [ ] 我知道完整的 API 开发流程（参考 `.ai/guides/api-workflow.md`）
- [ ] 我知道先定义 OpenAPI 规范，再实现代码
- [ ] 我知道如何打包和验证 OpenAPI
- [ ] 我知道如何生成前端类型
- [ ] 我知道如何实现后端和前端

---

## 规则优先级理解

- [ ] 我知道规则冲突时的优先级顺序：
  1. OpenAPI 规范（API 契约）
  2. 代码规范（`docs/standards/`）
  3. 任务指南（`.ai/guides/`）
  4. 全局规约（`.cursorrules`）
  5. 子目录规约（`frontend/.cursorrules`, `backend/.cursorrules`）

---

## 常见命令理解

### 前端命令

- [ ] 我知道如何启动前端开发服务器（`cd frontend && npm run dev`）
- [ ] 我知道如何运行前端测试（`npm run test`）
- [ ] 我知道如何生成 API 类型（`npx openapi-typescript`）

### 后端命令

- [ ] 我知道如何启动后端开发服务器（`cd backend && uvicorn main:app --reload`）
- [ ] 我知道如何运行后端测试（`pytest`）
- [ ] 我知道如何生成 Prisma 客户端（`npx prisma generate`）

### OpenAPI 命令

- [ ] 我知道如何打包 OpenAPI（`npm run bundle:openapi`）
- [ ] 我知道如何验证 OpenAPI（`npm run validate:openapi`）

---

## 故障排查理解

- [ ] 我知道遇到问题时应该先查看 `.ai/guides/troubleshooting.md`
- [ ] 我知道如何查看前端错误（浏览器控制台）
- [ ] 我知道如何查看后端错误（终端输出）
- [ ] 我知道常见错误的解决方案

---

## 不确定时的行动

如果对以上任何一项不确定，我应该：

1. **重新阅读** `.ai/CONTEXT.md`
2. **查看** `.ai/FAQ.md` 中的常见问题
3. **参考** 相关的任务指南（`.ai/guides/`）
4. **向用户确认** 我的理解是否正确

---

## 验证方法

### 测试你的理解

回答以下问题：

1. **Q**: 我需要查看认证相关的 API，应该读取哪个文件？  
   **A**: `docs/openapi/paths/auth.yaml` 和 `docs/openapi/schemas/auth.yaml`

2. **Q**: 我修改了 OpenAPI 文件，下一步应该做什么？  
   **A**: 运行 `npm run bundle:openapi` 打包，然后运行 `npm run validate:openapi` 验证

3. **Q**: 我需要创建一个新的 React 组件，应该参考哪个文档？  
   **A**: `.ai/guides/creating-component.md`

4. **Q**: 我遇到了 "Module not found" 错误，应该怎么办？  
   **A**: 查看 `.ai/guides/troubleshooting.md` 中的前端常见问题部分

5. **Q**: 我不确定应该在哪个模块添加新的 API，应该怎么办？  
   **A**: 查看 `.ai/guides/adding-api-endpoint.md` 中的"选择模块"部分

---

## 持续学习

- [ ] 我会在每次任务开始前检查 `.ai/CONTEXT.md` 是否有更新
- [ ] 我会在遇到新问题时查看 `.ai/FAQ.md` 是否有答案
- [ ] 我会在完成任务后验证我的实现是否符合规范
- [ ] 我会在不确定时主动向用户确认

---

## 自检通过标准

如果你能勾选以上所有项目，说明你已经正确理解了 Spectra 项目的结构和规范，可以开始执行任务了。

如果有任何不确定的地方，请重新阅读相关文档或向用户确认。
