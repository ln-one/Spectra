# 新人入职指南

## 快速开始

### 1. 克隆项目
```bash
git clone https://github.com/your-org/spectra.git
cd spectra
```

### 2. 安装根目录依赖（重要！）
```bash
npm install  # 这会自动安装 Git hooks
```

你会看到：
```
> spectra-api-docs@1.0.0 prepare
> husky

husky - Git hooks installed
```

### 3. 前端环境
```bash
cd frontend
npm install
cp .env.example .env  # 配置环境变量
npm run dev           # 启动开发服务器
```

### 4. 后端环境
```bash
cd backend
pip install -r requirements.txt
pip install -r requirements-dev.txt
cp .env.example .env  # 配置环境变量
prisma generate       # 生成 Prisma 客户端
```

## 验证 Hooks 是否生效

### 测试 pre-commit
```bash
# 创建一个测试文件
echo "console.log('test')" > test.js
git add test.js
git commit -m "test"
```

你应该看到：
```
🔍 Running pre-commit checks...

📦 Frontend checks...
  ├─ Checking format...
  ├─ Linting...
  ├─ Running tests...

🐍 Backend checks...
  ├─ Checking code format (black)...
  ├─ Checking import sorting (isort)...
  ├─ Linting (flake8)...
  ├─ Running tests...

✅ All checks passed!
```

### 如果没看到检查
说明 hooks 没安装，手动运行：
```bash
cd 项目根目录
npm install
```

## 常见问题

### Q: Commit 太慢怎么办？
A: 使用快速模式（跳过测试）：
```bash
npm run pre-commit:quick
git commit -m "your message"
```

### Q: 我改了代码但 pre-commit 失败
A: 自动修复格式问题：
```bash
# Frontend
cd frontend
npm run format
npm run lint -- --fix

# Backend
cd backend
black .
isort .
```

### Q: 紧急情况需要跳过检查
A: 不推荐，但可以：
```bash
git commit --no-verify
git push --no-verify
```
注意：这样会导致 CI 失败，需要后续修复。

### Q: Windows 用户注意事项
- 确保安装了 Node.js 和 Python
- Git Bash 会自动处理 shell 脚本
- 所有检查脚本都是跨平台的（Node.js）

## 开发工作流

```
1. 创建分支
   git checkout -b feature/your-feature

2. 开发代码
   - 前端：npm run dev
   - 后端：uvicorn main:app --reload

3. 提交代码
   git add .
   git commit -m "feat: your feature"
   ↓
   自动运行 pre-commit 检查

4. 推送代码
   git push origin feature/your-feature
   ↓
   自动运行 pre-push 检查

5. 创建 PR
   - GitHub CI 会自动运行
   - 本地检查通过 = CI 大概率通过
```

## 检查项说明

### Pre-commit（每次 commit）
- 代码格式检查
- 代码规范检查
- 单元测试
- 耗时：5-10 秒

### Pre-push（每次 push）
- 前端构建检查
- Prisma schema 验证
- 耗时：10-30 秒

### GitHub CI（每次 push 到远程）
- 完整的 CI/CD 流程
- 包含所有本地检查
- 耗时：2-5 分钟

## 为什么要这样做？

❌ **没有 hooks 的情况**：
```
开发 → commit → push → CI 失败 → 修复 → push → CI 失败 → ...
                        ↑
                    浪费 5 分钟
```

✅ **有 hooks 的情况**：
```
开发 → commit → 本地检查失败 → 修复 → commit 成功 → push → CI 通过
                ↑
            只需 10 秒
```

节省时间 = 节省 CI 资源 = 更快的反馈循环

## 团队规范

1. **不要跳过检查**：除非紧急情况
2. **失败立即修复**：不要积累问题
3. **保持依赖更新**：定期 `npm install` 和 `pip install`
4. **Prisma 改动**：记得运行 `prisma generate`

## 需要帮助？

- 查看 `scripts/README.md` 了解检查脚本详情
- 查看 `.cursorrules` 了解代码规范
- 查看 `docs/standards/` 了解各模块标准
