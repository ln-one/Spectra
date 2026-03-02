# 快速开始

> 目标：最短路径启动前后端并完成基础验证。

## 前置要求

- Node.js 20+
- Python 3.11+
- Docker（可选）

## 方式 A：本地开发（推荐）

### 1. 后端

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
prisma generate
prisma db push
uvicorn main:app --reload
```

### 2. 前端

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

### 3. 根目录安装 hooks

```bash
cd ..
npm install
```

## 方式 B：Docker

```bash
cp backend/.env.example backend/.env
docker-compose up
```

## 验证清单

- [ ] 前端可访问：`http://localhost:3000`
- [ ] 后端健康检查通过：`http://localhost:8000/health`
- [ ] Swagger 可访问：`http://localhost:8000/docs`

## 常见问题

- 依赖错误：确认已激活 `backend/venv`
- 前后端联通失败：检查 `NEXT_PUBLIC_API_URL`
- 数据库错误：重新执行 `prisma generate && prisma db push`

## 下一步

- [Onboarding](./onboarding.md)
- [Testing](./testing.md)
- [Code Quality](./code-quality.md)
