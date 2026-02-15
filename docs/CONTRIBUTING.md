# 贡献指南

> 核心规约 - 全组成员及AI工具必须严格遵守

## 三大核心规约

### 1. 仓库与分支安全

**main 分支保护**：
- 禁止直接 Push 到 main
- 所有改动必须通过 PR 合并
- 统一使用 Squash Merge

**PR 要求**：
- 至少 1 人审核通过
- 通过 CI 检查（Lint/Build）
- 无冲突

### 2. AI 友好型文档规范

**文档格式**：
- 内部全量使用 Markdown (.md)
- 外部交付文档（Word/PDF）由 MD 导出
- 禁止使用无法 Diff 的二进制文档

**逻辑绘图**：
- 使用 Mermaid.js 源码编写流程图、架构图
- 禁止粘贴截图

**视觉资产**：
- 图标使用 Lucide React
- Logo/矢量图以 SVG 源码存储
- 禁止使用 PNG/JPG 等位图

### 3. 模块化与原子化解耦协议

**复杂度红线**：
- 代码文件：单文件 >300 行必须拆分
- 文档文件：单篇 Markdown >6000 字符必须拆分

**演进模式**：

当功能复杂度上升时，采用"文件夹即模块"模式：

```
# 原始
AuthModule.ts

# 拆分后
AuthModule/
├── index.ts      # 编排者
├── Logic.ts      # 业务逻辑
├── UI.tsx        # 界面组件
└── Types.ts      # 类型定义
```

索引文件仅作编排：
```typescript
// AuthModule/index.ts
export { AuthLogic } from './Logic'
export { AuthUI } from './UI'
export type { AuthTypes } from './Types'
```

## 快速参考

### Commit 格式
```
<type>(<scope>): <subject>
```

Type: `feat` | `fix` | `refactor` | `docs` | `style` | `test` | `chore`

示例：
```bash
feat(chat): 添加流式响应支持
fix(upload): 修复大文件上传失败
docs(readme): 更新安装说明
```

### 开发流程
```bash
# 1. 创建分支
git checkout -b feat/功能名

# 2. 开发并提交
git commit -m "feat(scope): 描述"

# 3. 推送并创建 PR
git push origin feat/功能名
```

### 禁止事项
- 直接 Push 到 main
- 使用二进制文档作为源文件
- 粘贴截图代替 Mermaid 图表
- 单文件超过复杂度红线
- 提交敏感信息

## 详细规范

- [代码规范](./standards/code.md) - 前后端代码规范、API规范
- [Git 规范](./standards/git.md) - 分支策略、Commit、PR规范
- [文档规范](./standards/documentation.md) - Markdown、Mermaid、文档结构

## 相关文档

- [技术栈](./project/tech-stack.md)
- [项目需求](./project/requirements.md)
- [技术决策](./decisions/)

---

这些规范是为了让团队和 AI 更高效地协作，保持代码库的健康和可维护性。

