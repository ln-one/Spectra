# Cleanup Backlog

> Status: `active`
> Role: implementation cleanup queue, not canonical runtime truth.
> 目的：记录仍会影响架构叙事或文档可读性的残留清理项。

## 直接污染文档叙事的 warning

这些文件一旦继续膨胀，会直接让“Spectra 是 workflow shell”这件事变得不可信：

- `backend/services/render_engine_adapter_helpers/semantics.py`
- `backend/services/identity_service/`

## 旧器官优先清退

这些不是“只是大文件”，而是最容易重新制造主链幻觉的 residual legacy：

- `backend/services/generation/`
  - 必须继续保持 compatibility-only helper 层，不能再像 generation backend
- `backend/services/generation_session_service/outline_draft/`
  - 当前应视为 residual shadow area，不允许重新长回 active primary path

## 本轮已完成

- `backend/services/project_space_service/artifacts.py`
  - 已拆出 `artifact_modes.py`、`artifact_versions.py`、`artifact_rendering.py`
- `backend/services/ourograph_client.py`
  - 已拆成 `ourograph_client_support/transport.py`、`commands.py`、`queries.py`
- `backend/routers/generate_sessions/preview_runtime.py`
  - 已降级为薄入口，主逻辑迁到 `preview_runtime_handlers.py` / `preview_runtime_guards.py`
- `backend/services/task_executor/runtime_helpers.py`
  - 已拆出 `runtime_context.py`、`runtime_titles.py`、`runtime_render_outputs.py`、`runtime_artifact_persistence.py`

## 暂时主要是实现体积问题

这些 warning 目前更多是实现维护问题，不会立刻污染对外文档叙事：

- `backend/services/artifact_generator/animation_*`
- `backend/services/prompt_service/render_rewrite.py`
- `backend/services/template/css_generator.py`
- `backend/services/generation_session_service/card_*`
- `backend/routers/chat/*`

## 下一轮推荐顺序

1. 继续压缩 `backend/services/generation/` 的 compatibility surface
2. 保持 `outline_draft` 失去默认可见性，不让源码回流
3. 继续控制 `render_engine_adapter_helpers/semantics.py`
4. 保持 `identity_service/` 只作为 Limora local mirror helper
