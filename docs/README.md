# Spectra - 多模态AI教学智能体

基于AI的智能教学课件生成系统，通过自然对话帮助教师快速创建高质量的多模态教学课件。

> **⚠️ 重要**：开始工作前请先阅读 [贡献指南 (CONTRIBUTING.md)](./CONTRIBUTING.md) - 包含必须遵守的核心规约

## 技术栈

- **前端**: Next.js 15 + TypeScript + Tailwind CSS
- **后端**: FastAPI + Python 3.11 + Prisma ORM
- **数据库**: SQLite
- **AI**: 待确定（调研中）

## 项目结构

```
Spectra/
├── Spectra-Frontend/     # 前端
├── Spectra-Backend/      # 后端
└── Spectra-Docs/         # 文档（本仓库）
```

## 文档导航

### 核心规约
- [贡献指南 (CONTRIBUTING.md)](./CONTRIBUTING.md) - **必读**

### 项目基础
- [项目需求](./project/requirements.md) - 原始需求
- [技术栈](./project/tech-stack.md) - 技术选型

### 规范标准
- [代码规范](./standards/code.md)
- [Git 规范](./standards/git.md)
- [文档规范](./standards/documentation.md)

### 技术决策
- [决策记录](./decisions/) - ADR 技术决策

### 当前阶段：需求分析
- [需求分析](./requirements/) - 阶段说明
  - [用户体验](./requirements/ux/) - 成员B
  - [系统功能](./requirements/functional/) - 成员C
  - [AI能力](./requirements/ai/) - 成员D

### 架构与开发
- [架构设计](./architecture/) - 等需求完成后填充
- [开发指南](./guides/) - 按需填充

## 规范

详见 [开发规范](./standards/) 和 [贡献指南](./CONTRIBUTING.md)
