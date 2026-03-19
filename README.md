# Spectra

Spectra 是一个面向教学场景的多模态 AI 助教工作台：项目资料、对话、生成会话、预览修改与项目空间在同一条工作流中协同。

## 当前状态

当前代码库已经完成一轮结构收口：

- 前端 API 已统一到 `/Users/ln1/Projects/Spectra/frontend/lib/sdk`
- 后端大路由与大服务已大量改为 `folder-as-module`
- `main.py` 应用装配已拆分到 `/Users/ln1/Projects/Spectra/backend/app_setup/`
- `services/` 已开始按分区收口，`media` 分组已落地
- 架构守门脚本已可用：`/Users/ln1/Projects/Spectra/backend/scripts/architecture_guard.py`

## 快速入口

- 项目文档入口：`/Users/ln1/Projects/Spectra/docs/README.md`
- 开发规范入口：`/Users/ln1/Projects/Spectra/docs/standards/README.md`
- 贡献规范：`/Users/ln1/Projects/Spectra/docs/CONTRIBUTING.md`
- 架构下一阶段清单：`/Users/ln1/Projects/Spectra/docs/next-stage-architecture-optimization.md`
- 服务分区代办：`/Users/ln1/Projects/Spectra/docs/service-topology-todo.md`
- 变更记录：`/Users/ln1/Projects/Spectra/CHANGELOG.md`

## 当前建议的结构理解

### Frontend

- `/Users/ln1/Projects/Spectra/frontend/app/`：页面入口
- `/Users/ln1/Projects/Spectra/frontend/components/`：界面组件
- `/Users/ln1/Projects/Spectra/frontend/lib/sdk/`：统一 API SDK
- `/Users/ln1/Projects/Spectra/frontend/stores/`：状态管理

### Backend

- `/Users/ln1/Projects/Spectra/backend/routers/`：HTTP 入口层
- `/Users/ln1/Projects/Spectra/backend/services/`：业务与基础设施能力
- `/Users/ln1/Projects/Spectra/backend/app_setup/`：FastAPI 应用装配
- `/Users/ln1/Projects/Spectra/backend/schemas/`：请求/响应模型
- `/Users/ln1/Projects/Spectra/backend/tests/`：后端测试

## 本地开发

### Docker

```bash
docker-compose up --build
```

更多说明见：`/Users/ln1/Projects/Spectra/docs/guides/docker-setup.md`

### 后端

```bash
cd backend
pip install -r requirements.txt
pip install -r requirements-dev.txt
prisma generate
uvicorn main:app --reload
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

## 开发时建议先看

1. `/Users/ln1/Projects/Spectra/docs/standards/backend.md`
2. `/Users/ln1/Projects/Spectra/docs/standards/frontend.md`
3. `/Users/ln1/Projects/Spectra/docs/service-topology-todo.md`
4. `/Users/ln1/Projects/Spectra/backend/scripts/architecture_guard.py`
