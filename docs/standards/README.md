# 开发规范

> 核心规约：见 `/Users/ln1/Projects/Spectra/docs/CONTRIBUTING.md`

## 规范清单

- [前端规范](./frontend.md)
- [后端规范](./backend.md)
- [Git 规范](./git.md)
- [文档规范](./documentation.md)
- [AI 协作工作流](./AI_COLLABORATION.md)

## 当前重点

- 新增模块优先采用 `folder-as-module`
- 后端新生产代码优先显式导入，避免默认使用 `from services import ...`
- 开发中优先遵循已有分区：`application / generation / media / platform`
- 不做大爆炸式重构，优先低风险、小步收口

## 最小执行清单

- Commit 格式：`<type>(<scope>): <subject>`
- 分支策略：`main -> develop -> feature/*`
- 合并方式：Squash Merge + 至少 1 人 Review
- 提交前建议运行：

```bash
python3 backend/scripts/architecture_guard.py
```
