# Code Quality Guide

## Frontend

### Prettier (Code Formatting)

Auto-format code:
```bash
cd frontend
npm run format
```

Check formatting:
```bash
npm run format:check
```

### ESLint (Code Quality)

Run linting:
```bash
npm run lint
```

Fix auto-fixable issues:
```bash
npm run lint -- --fix
```

### Rules
- No console.log (use console.warn/error)
- Unused variables prefixed with `_` are allowed
- TypeScript `any` triggers warning
- React hooks dependencies checked

## Backend

### Black (Code Formatting)

Format code:
```bash
cd backend
black .
```

Check formatting:
```bash
black --check .
```

### Flake8 (Code Quality)

Run linting:
```bash
flake8 .
```

### isort (Import Sorting)

Sort imports:
```bash
isort .
```

Check imports:
```bash
isort --check .
```

### Configuration
- Line length: 88 characters
- Python 3.11 target
- Black-compatible settings

## Git Hooks（自动化检查）

项目使用 Husky 自动在 commit 和 push 时运行检查，确保代码质量。

### 安装

```bash
# 在项目根目录
npm install  # 自动安装 Git hooks
```

### Pre-commit Hook

每次 `git commit` 时自动运行：

**检查项**：
- Frontend: Prettier 格式 + ESLint + 测试
- Backend: Black 格式 + isort + Flake8 + 测试

**耗时**：5-10 秒

### Pre-push Hook

每次 `git push` 时自动运行：

**检查项**：
- Frontend: 构建检查
- Backend: Prisma schema 验证

**耗时**：10-30 秒

### 手动运行

```bash
# 完整检查（包含测试）
npm run pre-commit:full

# 快速检查（自动修复格式，跳过测试）
npm run pre-commit:quick

# Push 前检查
npm run pre-push
```

### 跳过检查（不推荐）

紧急情况下可以跳过：
```bash
git commit --no-verify
git push --no-verify
```

注意：这会导致 CI 失败，需要后续修复。

### 为什么使用 Hooks？

**没有 hooks**：
```
开发 → commit → push → CI 失败（5分钟） → 修复 → push → ...
```

**有 hooks**：
```
开发 → commit → 本地检查失败（10秒） → 修复 → commit 成功 → push → CI 通过
```

节省时间 + 节省 CI 资源 = 更快的反馈循环

详细说明见 [scripts/README.md](../../scripts/README.md)

## Editor Integration

### VS Code

Install extensions:
- ESLint
- Prettier
- Python (with Black formatter)

Add to `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[python]": {
    "editor.defaultFormatter": "ms-python.black-formatter"
  },
  "python.linting.flake8Enabled": true,
  "python.linting.enabled": true
}
```

## Pre-commit Hooks (Deprecated)

~~Install husky:~~
```bash
cd frontend
npm install --save-dev husky
npx husky install
```

**注意**：项目已在根目录配置了统一的 Git hooks，无需单独安装。
新人只需在项目根目录运行 `npm install` 即可。

Hooks will run automatically before commits.

## CI Integration

GitHub Actions automatically checks:
- Frontend: ESLint + Prettier + Tests + Build
- Backend: Black + isort + Flake8 + Tests + Prisma

本地 Git hooks 与 CI 检查项基本一致，并在本地包含额外检查（如 `prisma validate`），确保：
- ✅ 本地通过 = CI 通过
- ✅ 减少 CI 失败次数
- ✅ 更快的开发反馈

See [CI/CD Guide](./ci-cd.md) for details.
