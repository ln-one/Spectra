# Pre-commit 检查脚本

## 跨平台兼容

使用 Node.js 脚本确保 Mac/Linux/Windows 都能正常运行。

## Git Hooks 流程

```
git commit → pre-commit (完整检查: 格式 + lint + 测试)
 ↓
git push → pre-push (完整检查: 构建 + Prisma)
 ↓
GitHub → CI (最终验证)
```

## 使用方式

### 自动触发（推荐）
```bash
git commit -m "your message" # 触发 pre-commit
git push # 触发 pre-push
```

### 手动运行
```bash
# 完整检查（包含测试）
npm run pre-commit:full

# 快速检查（跳过测试，自动修复格式）
npm run pre-commit:quick

# Push 前检查（构建 + Prisma）
npm run pre-push

# OpenAPI Target 打包与验证（跨平台）
npm run bundle:openapi:target
npm run validate:openapi:target

# 实现 vs Target 对齐检查（需后端运行）
node scripts/validate-contract-target.js
```

## 检查项目

### Pre-commit（每次 commit）
**Frontend**
- Prettier 格式检查
- ESLint 代码检查
- Jest 单元测试

**Backend**
- Black 代码格式检查
- isort 导入排序检查
- Flake8 代码规范检查
- Pytest 单元测试

**OpenAPI**
- Source/Target 打包与 lint
- 实现 vs Target 对齐检查（需要后端已启动 `localhost:8000`）

### Pre-push（每次 push）
**Frontend**
- Next.js 构建检查

**Backend**
- Prisma schema 验证
- Prisma client 生成

**OpenAPI**
- Source/Target 打包与 lint
- 实现 vs Target 对齐检查（需要后端已启动 `localhost:8000`）

## 与 CI 保持一致

本地检查项与 `.github/workflows/ci.yml` 基本保持一致，并在此基础上增加了一些本地检查（例如 Prisma schema 验证），以避免：
- 本地 commit 通过，CI 失败
- 团队成员环境不一致
- 忘记运行 prisma generate

## 为什么分两步？

**Pre-commit（每次 commit）**：1-5 秒
- 频繁触发，必须快
- 主要检查代码质量 + 核心单元测试

**Pre-push（慢）**：10-30 秒
- 不频繁，可以慢一点
- 检查能否真正运行

## 快速修复

如果检查失败：

```bash
# Frontend 自动修复
cd frontend
npm run format
npm run lint -- --fix

# Backend 自动修复
cd backend
black .
isort .

# Prisma 问题
cd backend
prisma generate
```

或直接运行：
```bash
npm run pre-commit:quick # 自动修复 + 快速检查
```

## 跳过检查（不推荐）

紧急情况下可以跳过：
```bash
git commit --no-verify
git push --no-verify
```

但这样会导致 CI 失败，需要额外的 fix commit。
