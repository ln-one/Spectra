# CI/CD 配置指南

## GitHub Actions 工作流

### 触发条件
- Push 到 `main` 或 `develop` 分支（代码文件）
- 创建 Pull Request 到 `main` 或 `develop`（代码文件）

### 忽略文件
以下文件修改不会触发 CI（节省 Actions 额度）：
- Markdown 文档（`*.md`）
- `docs/` 目录下所有文件
- `.cursorrules`、`.gitignore`、`LICENSE`

### 检查项目

#### 前端 (frontend)
- 依赖安装
- ESLint 代码检查
- TypeScript 类型检查
- Jest 单元测试
- 构建验证

#### 后端 (backend)
- 依赖安装
- Black 代码格式检查
- Flake8 代码质量检查
- pytest 单元测试
- Prisma 生成验证

## 本地验证

### 前端检查
```bash
cd frontend
npm run lint
npm run format:check
npm test
npm run build
```

### 后端检查
```bash
cd backend
pip install -r requirements-dev.txt
black --check .
isort --check .
flake8 . --max-line-length=88
pytest
```

## 分支保护规则

建议在 GitHub 仓库设置中配置：

1. Settings → Branches → Add rule
2. Branch name pattern: `main`
3. 勾选:
 - Require status checks to pass before merging
 - Require branches to be up to date before merging
 - 选择 `frontend` 和 `backend` 检查

## 工作流程

```
开发者提交代码
 ↓
GitHub Actions 自动运行
 ↓
前端检查 + 后端检查
 ↓
全部通过 → 可以合并
失败 → 修复后重新提交
```

## 扩展

### 添加测试
在 `.github/workflows/ci.yml` 中添加:

```yaml
- name: Run tests
 working-directory: frontend
 run: npm test
```

### 添加部署
创建 `.github/workflows/deploy.yml` 用于自动部署
