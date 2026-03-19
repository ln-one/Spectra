# Backend

FastAPI 后端，当前已经从“单文件偏大、根目录平铺”演进到“目录模块 + 分区收口”的结构。

## 当前重点目录

- `/Users/ln1/Projects/Spectra/backend/main.py`：极薄入口
- `/Users/ln1/Projects/Spectra/backend/app_setup/`：FastAPI 装配
- `/Users/ln1/Projects/Spectra/backend/routers/`：HTTP 路由层
- `/Users/ln1/Projects/Spectra/backend/services/`：业务与基础设施能力
- `/Users/ln1/Projects/Spectra/backend/schemas/`：Pydantic 模型
- `/Users/ln1/Projects/Spectra/backend/tests/`：pytest 测试

## 当前服务分区方向

### application
- `file_upload_service/`
- `application/project_api.py`
- `rag_api_service/`
- `project_space_service/`

### generation
- `generation_session_service/`
- `courseware_ai/`
- `preview_helpers/`
- `artifact_generator/`
- `task_executor/`

### media
- `media/audio.py`
- `media/video.py`
- `media/web_search.py`
- `media/embedding.py`
- `media/vector.py`
- `media/rag_indexing.py`

### platform
- `platform/`
- `ai/`
- `ai/model_router.py`
- `prompt_service/`
- `database/`
- `task_queue/`
- `auth_service.py`
- `application/file_management.py`

## 常用命令

```bash
cd backend
black .
isort .
flake8 .
pytest
python3 scripts/architecture_guard.py
uvicorn main:app --reload
```

## 开发约束

- `router` 不承载复杂业务编排
- 新生产代码优先显式导入，不默认使用 `from services import ...`
- 单文件 `>300` 行进入复查，`>500` 行默认拆分
- 新增模块优先采用 `folder-as-module`

更多说明见：

- `/Users/ln1/Projects/Spectra/docs/standards/backend.md`
- `/Users/ln1/Projects/Spectra/docs/service-topology-todo.md`
- `/Users/ln1/Projects/Spectra/docs/next-stage-architecture-optimization.md`
