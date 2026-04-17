# Services

`backend/services/` 现在应该被理解成 **workflow shell + authority adapters + local helpers**，而不是“大而全能力实现区”。

更准确地说，这里包含三类东西：

- kernel organs：属于 Spectra orchestration kernel 本体
- authority adapters：连接六个正式能力源的反腐层
- transitional local helpers：短中期允许保留、但不能伪装成正式 authority 的本地辅助器官

## 当前理解方式

### workflow shell

负责 Session、事件、任务编排和产品聚合：

- `ai/`
- `prompt_service/`
- `generation_session_service/`
- `platform/`
- `preview_helpers/`
- `task_executor/`
- `task_queue/`
- `application/project_api.py`
- `application/file_management.py`

### authority adapters

负责连接六个正式能力源，并作为 anti-corruption layer 进行翻译：

- `diego_client.py`
- `render_engine_adapter.py`
- `ourograph_client.py`
- `platform/dualweave_client.py`
- `stratumind_client.py`
- `platform/limora_client.py`
- `project_space_service/`：仅作为 `Ourograph facade`

### local helpers

负责不应外移的本地辅助能力：

- `database/`
- `media/`
- `rag_api_service/`
- `file_parser/`
- `artifact_generator/`：仅保留非 Office 文件 helper
- `generation/`：仅保留 markdown compatibility/helper

它们是 transitional local auxiliaries，不是正式能力源。

## 目录阅读建议

- 如果一个模块看起来像“正式能力源”，先检查它是不是 facade / adapter。
- `render_engine_adapter*`、`ourograph_client*`、`project_space_service/`、`identity_service/` 都应被理解成反腐层或本地 mirror 壳层，而不是上游领域 owner。
- `project_space_service`、`artifact_generator`、`generation/` 当前都不是正式能力源目录。
- `prompt_service/` 和 `generation_session_service/` 应优先理解成 Spectra kernel organs，不要把它们误判为“还没拆完的旧 generation core”。
- backend-local Marp/Pandoc/PPTX/DOCX 主链已经移除，不要从目录名反推旧架构。
- 看到本地模块时，不要先问“为什么还没拆出去”，而先问它是 kernel organ、transitional local helper，还是 residual legacy organ。

## 新增代码建议

1. 先判断属于 workflow shell、authority adapter，还是 local helper
2. 优先放进已有目录模块
3. 不要继续在根目录平铺新 `*_service.py`
4. 新生产代码优先显式导入

## 自检

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/architecture_guard.py
```

更多规则见：

- `/Users/ln1/Projects/Spectra/docs/standards/backend.md`
- `/Users/ln1/Projects/Spectra/docs/architecture/service-boundaries.md`
