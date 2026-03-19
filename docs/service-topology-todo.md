# Service Topology TODO

## 已完成的主要收口

已将一部分内容能力服务从 `/Users/ln1/Projects/Spectra/backend/services/` 根目录收进媒体分组：

- `/Users/ln1/Projects/Spectra/backend/services/media/audio.py`
- `/Users/ln1/Projects/Spectra/backend/services/media/video.py`
- `/Users/ln1/Projects/Spectra/backend/services/media/web_search.py`
- `/Users/ln1/Projects/Spectra/backend/services/media/embedding.py`
- `/Users/ln1/Projects/Spectra/backend/services/media/vector.py`
- `/Users/ln1/Projects/Spectra/backend/services/media/rag_indexing.py`
- `/Users/ln1/Projects/Spectra/backend/services/media/__init__.py`

本次同步完成：

- 生产代码导入迁移到 `services.media.*`
- 相关测试导入与 patch 路径同步迁移
- `media` 作为独立分组开始承接音频、视频、搜索、向量化、索引等内容能力
- `architecture_guard` warning 已从 7 降到 0

后续又继续完成了：

- `application/`
  - `/Users/ln1/Projects/Spectra/backend/services/application/project_api.py`
  - `/Users/ln1/Projects/Spectra/backend/services/application/file_management.py`
- `platform/`
  - `/Users/ln1/Projects/Spectra/backend/services/platform/redis_manager.py`
  - `/Users/ln1/Projects/Spectra/backend/services/platform/state_transition_guard.py`
  - `/Users/ln1/Projects/Spectra/backend/services/platform/task_recovery.py`
- `quality_service/`
  - `/Users/ln1/Projects/Spectra/backend/services/quality_service/`

## 当前建议的顶层分区

### application

面向 router / use-case 的接口编排层。

当前已基本收口：

- `file_upload_service/`
- `application/project_api.py`
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
- `embedding.py`
- `vector.py`
- `rag_indexing.py`

待继续收口：

- `rag_service/`
- `network_resource_strategy/`

### platform

平台级基础设施与通用能力。

当前已基本收口：

- `ai/`
- `prompt_service/`
- `database/`
- `task_queue/`
- `platform/`
- `auth_service.py`
- `application/file_management.py`

## 下一批推荐动作

优先做低打扰精修：

1. 继续清理 `/Users/ln1/Projects/Spectra/backend/services/__init__.py` 的兼容导出
2. 继续减少生产代码里对兼容导出的依赖
3. 评估是否将 `/Users/ln1/Projects/Spectra/backend/services/rag_service/` 和 `/Users/ln1/Projects/Spectra/backend/services/network_resource_strategy/` 进一步并入 `media`
4. 持续把 timeout / failure reason / worker recovery 的稳定性语义补齐

原因：

- 当前根目录平铺和超阈值问题已基本清零
- 下一阶段更值得做的是兼容层瘦身和稳定性治理
- 继续迁移时仍要避免过早碰高频主业务链路

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
