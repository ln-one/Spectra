# 变更记录

> 记录 AI 协作系统的重要变更

## [1.1.1] - 2026-03-20

### Changed（变更）

- 更新 `.ai/CONTEXT.md`：补充当前前端目录收口结构（`app/**/_views`、`components/project/features`、`lib/sdk`、`stores/project-store`）
- 更新 `.ai/FAQ.md`：将前端调用路径从 `lib/api` 同步为 `lib/sdk`，补充页面实现与项目域组件放置规则
- 更新 `.ai/guides/best-practices.md`：同步前端文件结构示意为当前仓库真实结构
- 更新 API 相关指南路径：`adding-api-endpoint.md`、`api-workflow.md`、`creating-component.md`、`troubleshooting.md` 中 `lib/api` 示例路径统一为 `lib/sdk`

## [1.0.0] - 2026-02-26

### Added（新增）

- 创建 `.ai/` 目录作为 AI 专用文档目录
- 创建 `.ai/CONTEXT.md` 作为 AI 的唯一入口文档（包含 Kiro 特定功能说明）
- 创建 `.ai/FAQ.md` 常见问题文档
- 创建 `.ai/self-check.md` AI 自检清单
- 创建任务指南：
 - `.ai/guides/api-workflow.md` - API 开发完整流程
 - `.ai/guides/adding-api-endpoint.md` - 添加新 API 端点
 - `.ai/guides/creating-component.md` - 创建 React 组件
 - `.ai/guides/troubleshooting.md` - 故障排查
 - `.ai/guides/best-practices.md` - 最佳实践
- 创建文档验证脚本 `scripts/check-ai-docs.sh`
- 更新 `.kiro/steering/project-rules.md` 添加 AI 协作系统引用

### Changed（变更）

- 更新根目录 `.cursorrules` 添加 `.ai/` 目录引用
- 更新 `frontend/.cursorrules` 添加前端任务指南链接
- 更新 `backend/.cursorrules` 添加后端任务指南链接
- 更新 `docs/.cursorrules` 添加文档任务指南链接
- 更新 `.kiro/steering/project-rules.md` 整合 AI 协作系统
- 移除 `.ai/tool-specific/` 目录，将工具特定内容直接整合到主文档

### Improved（改进）

- 优化 AI 上下文加载策略（从 ~5000 tokens 降低到 ~1000 tokens）
- 建立渐进式文档结构（核心 → 领域 → 详细）
- 明确任务类型到文档的映射关系
- 提供 OpenAPI 模块快速索引

---

## 维护指南

### 何时更新 CHANGELOG

在以下情况下更新此文件：

1. **添加新文档**：在 `.ai/` 目录下添加新文档时
2. **重大变更**：修改核心文档结构或内容时
3. **废弃功能**：标记某些文档或规则为废弃时
4. **修复错误**：修复文档中的重要错误时

### 如何编写变更说明

使用以下分类：

- **Added**：新增的功能或文档
- **Changed**：对现有功能的变更
- **Deprecated**：即将废弃的功能
- **Removed**：已移除的功能
- **Fixed**：错误修复
- **Security**：安全相关的变更

### 示例

```markdown
## [1.1.0] - 2026-03-01

### Added
- 添加 `.ai/guides/deployment.md` 部署指南

### Changed
- 更新 `.ai/CONTEXT.md` 添加新的模块索引

### Fixed
- 修复 `.ai/FAQ.md` 中的错误链接
```

---

## 版本规范

使用语义化版本号：`MAJOR.MINOR.PATCH`

- **MAJOR**：重大变更，可能不兼容旧版本
- **MINOR**：新增功能，向后兼容
- **PATCH**：错误修复，向后兼容

---

## 反馈收集

### AI 使用反馈

记录 AI 工具使用过程中的问题和改进建议：

- 哪些文档最有用？
- 哪些文档需要改进？
- 哪些信息缺失？
- 哪些信息冗余？

### 开发者反馈

记录开发者使用 AI 协作系统的体验：

- AI 是否能快速找到所需信息？
- AI 是否能正确理解项目结构？
- AI 生成的代码是否符合规范？
- 文档是否清晰易懂？

---

## 未来计划

### 短期（1-2 个月）

- [ ] 添加更多任务指南（部署、测试、性能优化）
- [ ] 完善故障排查指南
- [ ] 添加更多代码示例

### 中期（3-6 个月）

- [ ] 建立自动化文档更新机制
- [ ] 添加交互式指南
- [ ] 支持多语言文档

### 长期（6+ 个月）

- [ ] 建立 AI 学习系统（从错误中学习）
- [ ] 可视化项目结构和数据流
- [ ] 集成 AI 辅助工具
