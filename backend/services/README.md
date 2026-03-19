# Services

`/Users/ln1/Projects/Spectra/backend/services/` 当前不再建议继续简单平铺新增 `*_service.py`，而是优先按领域目录组织。

## 当前理解方式

### application

面向接口/用例编排：

- `file_upload_service/`
- `project_api_service.py`
- `rag_api_service/`
- `project_space_service/`

### generation

面向课件生成、预览、导出、任务执行：

- `generation_session_service/`
- `courseware_ai/`
- `preview_helpers/`
- `artifact_generator/`
- `task_executor/`

### media

面向音视频、搜索、向量化与索引：

- `media/audio.py`
- `media/video.py`
- `media/web_search.py`
- `media/embedding.py`
- `media/vector.py`
- `media/rag_indexing.py`
- `network_resource_strategy/`
- `rag_service/`

### platform

面向平台基础设施：

- `ai/`
- `prompt_service/`
- `database/`
- `task_queue/`
- `auth_service.py`
- `file_management_service.py`

## 新增代码建议

1. 先判断属于哪个分区
2. 优先放进已有目录模块
3. 不要为了图省事继续在根目录平铺新服务文件
4. 新生产代码优先显式导入

## 自检

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/architecture_guard.py
```

更多后续规划见：

- `/Users/ln1/Projects/Spectra/docs/service-topology-todo.md`
- `/Users/ln1/Projects/Spectra/docs/standards/backend.md`
