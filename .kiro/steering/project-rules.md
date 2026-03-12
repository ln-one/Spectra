---
inclusion: always
---

# Spectra 项目规范

> **AI 快速开始**: 请先阅读 `.ai/CONTEXT.md` 获取完整项目上下文

## 新的 AI 协作系统

本项目已建立完整的 `.ai/` 目录系统，提供更好的 AI 协作体验：

- **入口文档**: `.ai/CONTEXT.md` - 项目概览和快速索引
- **常见问题**: `.ai/FAQ.md` - 快速解答
- **任务指南**: `.ai/guides/` - 具体操作步骤
- **自检清单**: `.ai/self-check.md` - 验证理解

**推荐工作流程**：
1. 阅读 `.ai/CONTEXT.md` 了解项目
2. 根据任务类型找到对应指南
3. 按照指南执行任务
4. 使用自检清单验证

## AI 自主学习机制

** 强制执行 - 在回复用户前必须完成**：

### 第一步：上下文加载（新对话或新任务时）
如果满足以下任一条件，立即读取 `.ai/CONTEXT.md`：
- 这是对话的第一条消息
- 用户提出新的任务请求（"帮我..."、"我想..."、"如何..."）
- 用户询问项目相关问题（"你知道..."、"项目..."）
- 当前没有打开的编辑器文件

### 第二步：任务类型识别
根据用户请求和 CONTEXT.md 的指引，识别任务类型并读取对应规范：
- **前端任务** → 读取 `frontend/.cursorrules` + `docs/standards/frontend.md`
- **后端任务** → 读取 `backend/.cursorrules` + `docs/standards/backend.md`
- **API 修改** → 读取 `docs/openapi/{paths|schemas}/{模块}.yaml`
- **文档任务** → 读取 `docs/.cursorrules` + `docs/standards/documentation.md`

### 第三步：执行任务
按照读取的规范和指南执行任务

### 第四步：持续改进
1. 主动总结经验并提炼可复用规则
2. 必要时更新 `docs/standards/` 相关文档
3. 禁止等用户重复说同样的问题
4. 根据实际需求参照 `docs/architecture/` 相关文档

## 规则优先级

```
1. docs/openapi/ (API 契约 - 拆分后的模块文件)
2. docs/standards/ (代码规范)
3. .cursorrules (根目录) (全局规约)
4. 子目录 .cursorrules (团队自定义)
```

## OpenAPI 文档规范

**重要**: OpenAPI 规范已拆分为模块化文件，AI 应参照拆分后的文件：

- **不要读取** `docs/openapi-target.yaml` (1266行，自动生成的打包文件)
- **应该读取** `docs/openapi/` 下的模块文件 (每个50-150行)

### 文件结构
```
docs/openapi/
├── paths/ # API 路径定义 (按模块拆分)
│ ├── auth.yaml
│ ├── chat.yaml
│ ├── files.yaml
│ ├── generate.yaml
│ ├── preview.yaml
│ ├── project.yaml
│ └── rag.yaml
├── schemas/ # 数据模型定义
│ ├── common.yaml
│ ├── auth.yaml
│ ├── chat.yaml
│ ├── files.yaml
│ ├── generate.yaml
│ ├── preview.yaml
│ ├── project.yaml
│ └── rag.yaml
└── components/ # 可复用组件
 ├── parameters.yaml
 ├── responses.yaml
 └── security.yaml
```

### AI 工作流程
1. **查看 API 定义** → 读取 `docs/openapi/paths/{模块}.yaml`
2. **查看数据模型** → 读取 `docs/openapi/schemas/{模块}.yaml`
3. **修改后打包** → 运行 `npm run bundle:openapi`

## 核心规则

### Commit 格式
```
<type>(<scope>): <subject>
```
Type: feat | fix | refactor | docs | style | test | chore

### 禁止事项
- 直接 Push 到 main
- 单文件 >300 行
- 单文档 >6000 字符
- 提交敏感信息

### 文档分类
- `.cursorrules` → 给 AI：规则、示例、命令
- `docs/` → 给人：理念、原因、流程

## 任务类型识别

根据用户请求，自动读取对应规范：
- **前端任务** → 读取 `frontend/.cursorrules` + `docs/standards/frontend.md`
- **后端任务** → 读取 `backend/.cursorrules` + `docs/standards/backend.md`
- **API 修改** → 读取 `docs/openapi/{paths|schemas}/{模块}.yaml` (拆分后的文件)
- **文档任务** → 读取 `docs/.cursorrules` + `docs/standards/documentation.md`

### API 相关任务示例
- 修改认证接口 → 读取 `docs/openapi/paths/auth.yaml` + `docs/openapi/schemas/auth.yaml`
- 添加新接口 → 在对应模块文件中添加，然后更新 `docs/openapi-target-source.yaml`
- 查看数据模型 → 读取 `docs/openapi/schemas/{模块}.yaml`

## 工作流程

```
用户提问 → AI 识别任务类型 → 读取相关规范 → 执行任务 → 总结经验 → 更新规范
```
