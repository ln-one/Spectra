# 快速开始

> 5 分钟内在本地运行 Spectra

## 前置要求

- **Docker** 和 **Docker Compose** ([下载](https://www.docker.com/products/docker-desktop/))
- **Git** ([下载](https://git-scm.com/))

## 快速启动（Docker - 推荐）

### 1. 克隆仓库

```bash
git clone https://github.com/ln-one/Spectra.git
cd Spectra
```

### 2. 配置环境变量

```bash
# 后端
cp backend/.env.example backend/.env
# 编辑 backend/.env 填入你的 OPENAI_API_KEY

# 前端（可选）
cp frontend/.env.example frontend/.env.local
```

### 3. 使用 Docker Compose 启动

```bash
docker-compose up
```

完成！

- **前端**: http://localhost:3000
- **后端 API**: http://localhost:8000
- **API 文档 (Swagger UI)**: http://localhost:8000/docs - 交互式测试
- **API 文档 (ReDoc)**: http://localhost:8000/redoc - 美观阅读

### 4. 停止服务

```bash
# 停止（保留数据）
docker-compose down

# 停止并删除所有数据
docker-compose down -v
```

---

## 本地开发（不使用 Docker）

> 适合需要热重载的开发者

### 前置要求

- **Node.js** 20+ ([下载](https://nodejs.org/))
- **Python** 3.11+ ([下载](https://www.python.org/))

### 后端配置

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows 系统: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 API 密钥（OPENAI_API_KEY 等）

# 初始化数据库
prisma generate
prisma db push

# 启动后端服务器
uvicorn main:app --reload
```

后端运行地址: **http://localhost:8000**
- Swagger UI: **http://localhost:8000/docs** (交互式测试)
- ReDoc: **http://localhost:8000/redoc** (文档阅读)

### 前端配置

打开新的终端：

```bash
cd frontend

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local

# 启动开发服务器
npm run dev
```

前端运行地址: **http://localhost:3000**

### 安装 Git Hooks（重要！）

回到项目根目录安装 Git hooks，这会自动检查代码质量：

```bash
cd ..  # 回到项目根目录
npm install  # 安装 husky 和 Git hooks
```

你会看到：
```
> spectra-api-docs@1.0.0 prepare
> husky

husky - Git hooks installed
```

这会在你 commit 和 push 时自动运行代码检查，避免 CI 失败。

1. 打开 http://localhost:3000 - 你应该能看到 Spectra 仪表板
2. 打开 http://localhost:8000/docs - 你应该能看到 Swagger UI 交互式文档
3. 打开 http://localhost:8000/redoc - 你应该能看到 ReDoc 美观文档
4. 尝试在仪表板中上传文件

### 验证 Git Hooks

测试 hooks 是否正常工作：

```bash
# 创建测试文件
echo "test" > test.txt
git add test.txt
git commit -m "test: verify hooks"
```

你应该看到自动运行的检查：
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

如果没看到检查，说明 hooks 没安装，回到项目根目录运行 `npm install`。

## 常见问题

### 后端无法启动

**症状**: `ModuleNotFoundError` 或找不到 `prisma` 命令

**解决方案**:
```bash
# 确保虚拟环境已激活
source venv/bin/activate

# 重新安装依赖
pip install -r requirements.txt
prisma generate
```

### 前端无法连接后端

**症状**: 网络错误或 CORS 问题

**解决方案**:
1. 确保后端在 8000 端口运行
2. 检查 `frontend/.env.local` 中的 `NEXT_PUBLIC_API_URL` 是否正确
3. 验证后端 CORS 设置允许 `localhost:3000`

### 数据库错误

**症状**: `Database not found` 或迁移错误

**解决方案**:
```bash
cd backend
prisma db push --force-reset  # 警告：这会重置所有数据
```

### 端口被占用

**症状**: `Address already in use`

**解决方案**:
```bash
# 查找并终止 8000 端口的进程（后端）
lsof -i :8000
kill -9 <PID>

# 查找并终止 3000 端口的进程（前端）
lsof -i :3000
kill -9 <PID>
```

## 开发工作流

### 日常开发

```bash
# 终端 1: 后端
cd backend
source venv/bin/activate
uvicorn main:app --reload

# 终端 2: 前端
cd frontend
npm run dev
```

### 提交前检查

Git hooks 会自动运行检查，但你也可以手动运行：

```bash
# 完整检查（包含测试）
npm run pre-commit:full

# 快速检查（自动修复格式，跳过测试）
npm run pre-commit:quick
```

或者分别检查：

```bash
# 后端: 格式化和检查
cd backend
black .
isort .
flake8 .

# 前端: 格式化和检查
cd frontend
npm run lint
npm run format
```

### 运行测试（如果可用）

```bash
# 后端
cd backend
pytest

# 前端
cd frontend
npm run test
```

## 项目结构概览

```
Spectra/
├── frontend/          # Next.js 14 应用
│   ├── app/          # 页面和路由
│   ├── components/   # React 组件
│   └── lib/          # 工具函数
├── backend/           # FastAPI 服务器
│   ├── routers/      # API 端点
│   ├── services/     # 业务逻辑
│   ├── schemas/      # 数据模型
│   └── prisma/       # 数据库
└── docs/              # 文档
```

## 下一步

- 阅读 [新人入职指南](./onboarding.md) - 了解完整的开发工作流和 Git hooks
- 阅读 [贡献指南](../CONTRIBUTING.md)
- 查看 [后端规范](../standards/backend.md)
- 查看 [前端规范](../standards/frontend.md)
- 了解 [Git 工作流](../standards/git.md)
- 查看 [代码质量指南](./code-quality.md) - 了解 CI/CD 和自动化检查

## 需要帮助？

- 查看上面的 [常见问题](#常见问题) 部分
- 查看已有的 [GitHub Issues](https://github.com/ln-one/Spectra/issues)
- 如果遇到问题可以创建新的 issue
