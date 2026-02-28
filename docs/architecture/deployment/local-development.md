# Local Development Environment

## 系统要求

**硬件要求**：
- CPU: 4 核心及以上
- 内存: 8GB 及以上
- 磁盘: 20GB 可用空间

**软件要求**：
- Docker Desktop 4.0+
- Node.js 18+ (可选)
- Python 3.11+ (可选)

## 快速启动

### 方式一：Docker Compose（推荐）

```bash
# 1. 克隆项目
git clone <repository-url>
cd spectra

# 2. 配置环境变量
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

# 3. 启动所有服务
docker-compose up -d

# 4. 访问应用
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# Swagger UI: http://localhost:8000/docs
# ReDoc: http://localhost:8000/redoc

# 5. 查看日志
docker-compose logs -f

# 6. 停止服务
docker-compose down
```

### 方式二：本地运行

**后端启动**：
```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env

# 初始化数据库
prisma generate
prisma db push

# 启动服务
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**前端启动**：
```bash
cd frontend

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local

# 启动开发服务器
npm run dev
```

## Docker Compose 配置

```yaml
# docker-compose.yml
version: '3.8'

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8000
    depends_on:
      - backend

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
      - ./backend/uploads:/app/uploads
    environment:
      - DATABASE_URL=file:./dev.db
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
      - DASHSCOPE_API_KEY=${DASHSCOPE_API_KEY}
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## 数据持久化

**SQLite 数据库**：
- 位置: `backend/prisma/dev.db`
- 自动创建

**文件存储**：
- 位置: `backend/uploads/`
- 支持热重载

**向量数据库**：
- 位置: `backend/chroma_data/`
- ChromaDB 本地持久化

## 热重载

- **前端**: Next.js 自动支持
- **后端**: Uvicorn `--reload` 模式
- **Docker**: 卷挂载支持代码热更新

## 相关文档

- [Environment Variables](./environment-variables.md) - 环境变量配置
- [Troubleshooting](./troubleshooting.md) - 故障排查
