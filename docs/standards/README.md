# 开发规范

> **核心规约**：详见 [CONTRIBUTING.md](../CONTRIBUTING.md)

## 规范文档

- [前端代码规范](./frontend.md) - Next.js + TypeScript
- [后端代码规范](./backend.md) - FastAPI + Python
- [Git 规范](./git.md) - 分支策略、Commit、PR
- [文档规范](./documentation.md) - Markdown、Mermaid

## 快速参考

### Commit 格式
```
<type>(<scope>): <subject>
```

### 复杂度红线
- 代码文件: <300 行
- 文档文件: <1500 字符

### 分支策略
```
main → develop → feature/功能名
```

### 合并方式
- 使用 Squash Merge
- 至少 1 人 Review

