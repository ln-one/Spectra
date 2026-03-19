# Service Topology TODO

## 已完成的第一批收口

已将一部分内容能力服务从 `/Users/ln1/Projects/Spectra/backend/services/` 根目录收进媒体分组：

- `/Users/ln1/Projects/Spectra/backend/services/media/audio.py`
- `/Users/ln1/Projects/Spectra/backend/services/media/video.py`
- `/Users/ln1/Projects/Spectra/backend/services/media/web_search.py`
- `/Users/ln1/Projects/Spectra/backend/services/media/__init__.py`

本次同步完成：

- 生产代码导入迁移到 `services.media.*`
- 相关测试导入与 patch 路径同步迁移
- `media` 作为独立分组开始承接音频、视频、搜索等内容能力

## 当前建议的顶层分区

### application

面向 router / use-case 的接口编排层。

建议归入：

- `file_upload_service/`
- `project_api_service.py`
- `rag_api_service/`
- `project_space_service/`

### generation

课件生成、预览、渲染、任务执行相关主链路。

建议归入：

- `generation_session_service/`
- `courseware_ai/`
- `preview_helpers/`
- `artifact_generator/`
- `task_executor/`

### media

外部内容、检索、音视频、向量化、网络资源处理能力。

已完成部分：

- `audio.py`
- `video.py`
- `web_search.py`

待继续收口：

- `embedding_service.py`
- `vector_service.py`
- `rag_indexing_service.py`
- `rag_service/`
- `network_resource_strategy/`

### platform

平台级基础设施与通用能力。

建议归入：

- `ai/`
- `prompt_service/`
- `database/`
- `task_queue/`
- `auth_service.py`
- `file_management_service.py`

## 下一批推荐动作

优先做低打扰迁移：

1. 收口 `/Users/ln1/Projects/Spectra/backend/services/embedding_service.py`
2. 收口 `/Users/ln1/Projects/Spectra/backend/services/vector_service.py`
3. 收口 `/Users/ln1/Projects/Spectra/backend/services/rag_indexing_service.py`

原因：

- 与当前业务主链路耦合相对较低
- 与 `media` 分组语义一致
- 迁移后可以明显减少 `services/` 根目录平铺项

## 暂不建议现在大动的部分

以下模块更容易与正在进行的功能开发产生冲突，建议等当前迭代更稳定后再做：

- `generation_session_service/`
- `project_space_service/`
- `rag_api_service/`
- `file_upload_service/`
- `chat` / `generate_sessions` 主流程相关模块

## 迁移原则

后续继续推进时，遵循以下规则：

1. 每次只迁一个小组，不做全量搬家
2. 优先迁移独立能力模块，避免碰高频业务文件
3. 迁移目录后同步调整 import，不保留长期兼容壳
4. 每次迁移后跑定向测试与全量校验
5. 以“减少根目录平铺 + 保持分区语义清楚”为主要目标
